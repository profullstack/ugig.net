import { z } from "zod";
import { formatCurrency } from "@/lib/utils";

export const TEAM_ROLES = ["owner", "admin", "member"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const TEAM_MEMBER_STATUSES = ["active", "invited", "removed"] as const;
export type TeamMemberStatus = (typeof TEAM_MEMBER_STATUSES)[number];

export const TEAM_PROJECT_STATUSES = ["active", "paused", "archived"] as const;
export type TeamProjectStatus = (typeof TEAM_PROJECT_STATUSES)[number];

/** Highest rate the UI and the database will accept, per hour, in USD. */
export const MAX_BILLABLE_RATE_USD = 100000;

/**
 * URL key for a team. Lowercase, hyphen separated, no leading or trailing
 * hyphen — the same shape the `teams_slug_format` check enforces.
 */
export function slugifyTeamName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export const teamSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Slug must be lowercase letters, numbers and hyphens");

const rateSchema = z.number().min(0).max(MAX_BILLABLE_RATE_USD);

/** Optional override rate: absent leaves it alone, null clears it to "inherit". */
const rateOverrideSchema = rateSchema.nullable();

export const createTeamSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: teamSlugSchema.optional(),
  description: z.string().trim().max(500).nullable().optional(),
  billable_rate_usd: rateSchema.default(0),
});

export const updateTeamSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  slug: teamSlugSchema.optional(),
  description: z.string().trim().max(500).nullable().optional(),
  billable_rate_usd: rateSchema.optional(),
});

export const addTeamMemberSchema = z
  .object({
    // Identify the person by account (user id or username) or by email invite.
    user_id: z.string().uuid().optional(),
    username: z.string().trim().min(1).max(50).optional(),
    email: z.string().trim().email().max(320).optional(),
    role: z.enum(TEAM_ROLES).default("member"),
    title: z.string().trim().max(100).nullable().optional(),
    billable_rate_usd: rateOverrideSchema.optional(),
  })
  .refine((v) => Boolean(v.user_id || v.username || v.email), {
    message: "Provide a user_id, username or email",
  });

export const updateTeamMemberSchema = z.object({
  role: z.enum(TEAM_ROLES).optional(),
  title: z.string().trim().max(100).nullable().optional(),
  billable_rate_usd: rateOverrideSchema.optional(),
  status: z.enum(TEAM_MEMBER_STATUSES).optional(),
});

export const createTeamProjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(TEAM_PROJECT_STATUSES).default("active"),
  billable_rate_usd: rateOverrideSchema.optional(),
});

export const updateTeamProjectSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(TEAM_PROJECT_STATUSES).optional(),
  billable_rate_usd: rateOverrideSchema.optional(),
});

export const assignProjectMemberSchema = z.object({
  member_id: z.string().uuid(),
  billable_rate_usd: rateOverrideSchema.optional(),
});

/** Where an effective rate came from, so the UI can label inherited rates. */
export type RateSource = "assignment" | "member" | "project" | "team";

export type ResolvedRate = {
  rate: number;
  source: RateSource;
};

type RateInputs = {
  teamRate: number;
  projectRate?: number | null;
  memberRate?: number | null;
  assignmentRate?: number | null;
};

/**
 * Most specific wins: a rate negotiated for one person on one project beats
 * that person's own rate, which beats the project's rate, which beats the
 * team default. A null at any level means "inherit from the next one down".
 */
export function resolveBillableRate({
  teamRate,
  projectRate,
  memberRate,
  assignmentRate,
}: RateInputs): ResolvedRate {
  if (assignmentRate != null) return { rate: assignmentRate, source: "assignment" };
  if (memberRate != null) return { rate: memberRate, source: "member" };
  if (projectRate != null) return { rate: projectRate, source: "project" };
  return { rate: teamRate, source: "team" };
}

/** "$150/hr", or "Not set" when the team never picked a rate. */
export function formatHourlyRate(rate: number | null | undefined): string {
  if (rate == null) return "Not set";
  return `${formatCurrency(rate)}/hr`;
}

/** Owners and admins may change the roster, the projects and the rates. */
export function canManageTeam(role: TeamRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Accepts numbers and the strings that arrive from `<input type="number">`,
 * where an empty field means "inherit" rather than zero.
 */
export function parseRateInput(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
