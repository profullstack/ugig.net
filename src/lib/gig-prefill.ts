import type { GigInput } from "@/lib/validations";

/**
 * Generic pre-fill for /gigs/new from a link on another site, e.g. the
 * "Hire an AI agent or developer" link under a BufferOverride question:
 *
 *   /gigs/new?title=...&description=...&skills=a,b,c&utm_source=bufferoverride
 *
 * Like a template it only fills the form: the poster edits every field and
 * nothing is saved until they submit. Values are plain text in form fields
 * (React escapes them); they are never rendered as HTML.
 */

export const PREFILL_TITLE_MAX = 100; // gigSchema caps the title at 100
export const PREFILL_DESCRIPTION_MAX = 4000;
export const PREFILL_SKILLS_MAX = 8;
export const PREFILL_SKILL_MAX = 40;
export const PREFILL_SOURCE_MAX = 40;
/** safeRedirectPath refuses a ?redirect= longer than this. */
export const REDIRECT_PATH_MAX = 2048;

export interface GigPrefill {
  title?: string;
  description?: string;
  skills: string[];
  /** utm_source, reduced to [a-z0-9._-]. */
  source?: string;
  /** utm_medium, same rules; only passed through. */
  medium?: string;
}

type ParamValue = string | string[] | undefined;
export type PrefillSearchParams = Record<string, ParamValue>;

function first(value: ParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// C0/C1 control characters except tab and newline, plus bidi overrides and
// zero-width characters that can hide or reorder text.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

function cut(text: string, max: number): string {
  // Count code points so a cap never splits a surrogate pair.
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join("").trimEnd() : text;
}

export function cleanTitle(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const text = raw.replace(CONTROL, "").replace(/\s+/g, " ").trim();
  return text ? cut(text, PREFILL_TITLE_MAX) : undefined;
}

export function cleanDescription(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const text = raw
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(/\t/g, " ")
    .replace(/[ ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? cut(text, PREFILL_DESCRIPTION_MAX) : undefined;
}

export function cleanSkills(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const part of raw.split(",")) {
    const skill = cut(
      part
        .replace(CONTROL, "")
        .replace(/[^\p{L}\p{N} .+#/_-]/gu, "")
        .replace(/\s+/g, " ")
        .trim(),
      PREFILL_SKILL_MAX
    );
    const key = skill.toLowerCase();
    if (!skill || seen.has(key)) continue;
    seen.add(key);
    skills.push(skill);
    if (skills.length >= PREFILL_SKILLS_MAX) break;
  }
  return skills;
}

export function cleanSource(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const text = raw.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, PREFILL_SOURCE_MAX);
  return text || undefined;
}

/** Packed form used through the login hop; see prefillReturnPath. */
interface Packed {
  t?: string;
  d?: string;
  s?: string;
}

function toBase64Url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

function fromBase64Url(token: string): string | undefined {
  if (!/^[A-Za-z0-9_-]{1,4096}$/.test(token)) return undefined;
  try {
    return Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return undefined;
  }
}

function unpack(token: string | undefined): Packed {
  const json = token ? fromBase64Url(token) : undefined;
  if (!json) return {};
  try {
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== "object") return {};
    const v = value as Record<string, unknown>;
    const str = (x: unknown) => (typeof x === "string" ? x : undefined);
    return { t: str(v.t), d: str(v.d), s: str(v.s) };
  } catch {
    return {};
  }
}

/**
 * Read the pre-fill from /gigs/new search params. Explicit title, description
 * and skills win over the packed `prefill` token the login hop carries.
 * Returns undefined when there is nothing to fill.
 */
export function parseGigPrefill(params: PrefillSearchParams): GigPrefill | undefined {
  const packed = unpack(first(params.prefill));
  const title = cleanTitle(first(params.title) ?? packed.t);
  const description = cleanDescription(first(params.description) ?? packed.d);
  const skills = cleanSkills(first(params.skills) ?? packed.s);
  if (!title && !description && skills.length === 0) return undefined;
  return {
    title,
    description,
    skills,
    source: cleanSource(first(params.utm_source)),
    medium: cleanSource(first(params.utm_medium)),
  };
}

/** Form values for GigForm's initialData. Keys are left out when empty. */
export function prefillFormData(prefill: GigPrefill): Partial<GigInput> {
  const data: Partial<GigInput> = { listing_type: "hiring" };
  if (prefill.title) data.title = prefill.title;
  if (prefill.description) data.description = prefill.description;
  if (prefill.skills.length) data.skills_required = prefill.skills;
  return data;
}

const SOURCE_LABELS: Record<string, string> = {
  bufferoverride: "BufferOverride",
  "bufferoverride.com": "BufferOverride",
};

/** Human name for the note above the form, or undefined for no source. */
export function prefillSourceLabel(source: string | undefined): string | undefined {
  if (!source) return undefined;
  return SOURCE_LABELS[source] ?? source;
}

/**
 * The /gigs/new path to come back to after sign-in. The text goes in one
 * base64url `prefill` token: safeRedirectPath rejects whitespace and control
 * characters after percent-decoding (so a plain ?title=Fix%20it would be
 * dropped) and anything over 2048 characters, so the description is shortened
 * until the path fits.
 */
export function prefillReturnPath(
  prefill: GigPrefill | undefined,
  templateId?: string
): string {
  const base = new URLSearchParams();
  if (templateId) base.set("template", templateId);
  if (prefill?.source) base.set("utm_source", prefill.source);
  if (prefill?.medium) base.set("utm_medium", prefill.medium);

  const build = (description: string | undefined) => {
    const params = new URLSearchParams(base);
    if (prefill) {
      const packed: Packed = {};
      if (prefill.title) packed.t = prefill.title;
      if (description) packed.d = description;
      if (prefill.skills.length) packed.s = prefill.skills.join(",");
      if (Object.keys(packed).length) params.set("prefill", toBase64Url(JSON.stringify(packed)));
    }
    const qs = params.toString();
    return qs ? `/gigs/new?${qs}` : "/gigs/new";
  };

  const full = build(prefill?.description);
  if (full.length <= REDIRECT_PATH_MAX || !prefill?.description) return full;

  // Binary search for the longest description prefix that still fits.
  const chars = Array.from(prefill.description);
  const shortened = (keep: number) =>
    keep > 0 ? `${chars.slice(0, keep).join("").trimEnd()}...` : undefined;
  let lo = 0;
  let hi = chars.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (build(shortened(mid)).length <= REDIRECT_PATH_MAX) lo = mid;
    else hi = mid - 1;
  }
  return build(shortened(lo));
}
