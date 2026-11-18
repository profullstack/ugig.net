import { describe, expect, it } from "vitest";
import {
  PREFILL_DESCRIPTION_MAX,
  PREFILL_SKILLS_MAX,
  PREFILL_TITLE_MAX,
  REDIRECT_PATH_MAX,
  cleanSkills,
  parseGigPrefill,
  prefillFormData,
  prefillReturnPath,
  prefillSourceLabel,
} from "@/lib/gig-prefill";
import { safeRedirectPath } from "@/lib/safe-redirect";

/** What Next hands the page for a URL's query string. */
function paramsOf(path: string): Record<string, string> {
  const url = new URL(path, "https://ugig.net");
  return Object.fromEntries(url.searchParams);
}

/** Follow the login hop: page -> /login?redirect= -> LoginForm's safe check. */
function throughLogin(back: string): string | null {
  const login = new URL(`/login?redirect=${encodeURIComponent(back)}`, "https://ugig.net");
  return safeRedirectPath(login.searchParams.get("redirect"), null);
}

const BO = {
  title: "Why does bun install hang on a private registry?",
  description:
    "https://bufferoverride.com/q/abc123\n\nbun 1.4 hangs forever on install when the registry needs auth. Tried a .npmrc token.",
  skills: "bun,npm, TypeScript",
  utm_source: "bufferoverride",
  utm_medium: "cta",
};

describe("parseGigPrefill", () => {
  it("returns undefined when nothing is filled", () => {
    expect(parseGigPrefill({})).toBeUndefined();
    expect(parseGigPrefill({ utm_source: "bufferoverride" })).toBeUndefined();
    expect(parseGigPrefill({ title: "   ", skills: " , ," })).toBeUndefined();
  });

  it("reads title, description, skills and the utm source", () => {
    expect(parseGigPrefill(BO)).toEqual({
      title: BO.title,
      description: BO.description,
      skills: ["bun", "npm", "TypeScript"],
      source: "bufferoverride",
      medium: "cta",
    });
  });

  it("caps lengths and the number of skills", () => {
    const p = parseGigPrefill({
      title: "t".repeat(500),
      description: "d".repeat(10_000),
      skills: Array.from({ length: 20 }, (_, i) => `skill${i}`).join(","),
    })!;
    expect(p.title).toHaveLength(PREFILL_TITLE_MAX);
    expect(p.description).toHaveLength(PREFILL_DESCRIPTION_MAX);
    expect(p.skills).toHaveLength(PREFILL_SKILLS_MAX);
  });

  it("flattens the title, strips control and bidi characters", () => {
    const p = parseGigPrefill({
      title: "  Fix\n\tthe\u0000 build‮  ",
      description: "line one\r\n\r\n\r\n\r\nline\u0007 two​",
    })!;
    expect(p.title).toBe("Fix the build");
    expect(p.description).toBe("line one\n\nline two");
  });

  it("keeps markup as inert text (React escapes it, nothing renders HTML)", () => {
    const p = parseGigPrefill({ title: '<img src=x onerror="alert(1)">' })!;
    expect(p.title).toBe('<img src=x onerror="alert(1)">');
  });

  it("takes the first value of a repeated param", () => {
    expect(parseGigPrefill({ title: ["first title here", "second"] })?.title).toBe(
      "first title here"
    );
  });

  it("reduces utm_source to a safe slug", () => {
    expect(parseGigPrefill({ title: "x", utm_source: "Buffer<Override>!" })?.source).toBe(
      "bufferoverride"
    );
  });

  it("ignores a garbage prefill token", () => {
    expect(parseGigPrefill({ prefill: "not base64 !!" })).toBeUndefined();
    expect(parseGigPrefill({ prefill: Buffer.from("[1,2]").toString("base64url") })).toBeUndefined();
  });
});

describe("cleanSkills", () => {
  it("dedupes case-insensitively and drops odd characters", () => {
    expect(cleanSkills("Rust, rust ,C++,<b>go</b>,node.js,c#")).toEqual([
      "Rust",
      "C++",
      "bgo/b",
      "node.js",
      "c#",
    ]);
  });
});

describe("prefillFormData", () => {
  it("makes a hiring post and leaves empty fields out", () => {
    expect(prefillFormData({ title: "Fix the build please", skills: [] })).toEqual({
      listing_type: "hiring",
      title: "Fix the build please",
    });
    expect(prefillFormData(parseGigPrefill(BO)!).skills_required).toEqual([
      "bun",
      "npm",
      "TypeScript",
    ]);
  });
});

describe("prefillSourceLabel", () => {
  it("names BufferOverride and passes other slugs through", () => {
    expect(prefillSourceLabel("bufferoverride")).toBe("BufferOverride");
    expect(prefillSourceLabel("hn")).toBe("hn");
    expect(prefillSourceLabel(undefined)).toBeUndefined();
  });
});

describe("prefillReturnPath (the sign-in hop)", () => {
  it("is plain /gigs/new or the template alone when there is no pre-fill", () => {
    expect(prefillReturnPath(undefined)).toBe("/gigs/new");
    expect(prefillReturnPath(undefined, "pay-per-pr")).toBe("/gigs/new?template=pay-per-pr");
  });

  it("survives LoginForm's safe-redirect check and round-trips every field", () => {
    const prefill = parseGigPrefill(BO)!;
    const back = prefillReturnPath(prefill, "pay-per-pr");
    // A plain ?title=Why%20does... would fail: spaces are rejected once decoded.
    expect(throughLogin(back)).toBe(back);
    const params = paramsOf(back);
    expect(params.template).toBe("pay-per-pr");
    expect(params.utm_source).toBe("bufferoverride");
    expect(params.utm_medium).toBe("cta");
    expect(parseGigPrefill(params)).toEqual(prefill);
  });

  it("shortens a long description so the path still fits", () => {
    const prefill = parseGigPrefill({
      title: "A long question about unicode handling",
      description: "ünïcødé ✓ ".repeat(800),
      skills: "rust,go",
      utm_source: "bufferoverride",
    })!;
    const back = prefillReturnPath(prefill);
    expect(back.length).toBeLessThanOrEqual(REDIRECT_PATH_MAX);
    expect(throughLogin(back)).toBe(back);
    const after = parseGigPrefill(paramsOf(back))!;
    expect(after.title).toBe(prefill.title);
    expect(after.skills).toEqual(["rust", "go"]);
    expect(after.description!.endsWith("...")).toBe(true);
    expect(prefill.description!.startsWith(after.description!.slice(0, -3))).toBe(true);
  });

  it("explicit params win over the packed token", () => {
    const back = prefillReturnPath(parseGigPrefill({ title: "Packed title value" })!);
    const params = { ...paramsOf(back), title: "Explicit title value" };
    expect(parseGigPrefill(params)?.title).toBe("Explicit title value");
  });
});
