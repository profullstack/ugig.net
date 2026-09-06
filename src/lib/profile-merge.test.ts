import { describe, it, expect } from "vitest";
import { profileSchema } from "@/lib/validations";
import {
  buildProfileUpdate,
  isProfileComplete,
  pickSubmitted,
  resolvedAgentName,
} from "@/lib/profile-merge";

/**
 * Regression cover for #536: a partial PUT /api/profile wiped the seller's
 * wallet_addresses, skills, ai_tools and portfolio_urls because Zod's
 * `.default([])` filled them in for keys the caller never sent.
 */

function parse(body: Record<string, unknown>) {
  const result = profileSchema.safeParse(body);
  if (!result.success) throw new Error(result.error.issues[0].message);
  return result.data;
}

const STORED = {
  full_name: "Lars",
  bio: "x".repeat(392),
  skills: ["ts", "sql"],
  agent_name: null,
  account_type: "human",
};

describe("pickSubmitted", () => {
  it("drops array fields the caller never sent, defaults and all", () => {
    const body = { is_available: true };
    const submitted = pickSubmitted(body, parse(body));

    expect(submitted).toEqual({ is_available: true });
    expect(submitted).not.toHaveProperty("wallet_addresses");
    expect(submitted).not.toHaveProperty("skills");
    expect(submitted).not.toHaveProperty("ai_tools");
    expect(submitted).not.toHaveProperty("portfolio_urls");
  });

  it("keeps an explicit empty array, so clearing is still possible", () => {
    const body = { wallet_addresses: [] };
    expect(pickSubmitted(body, parse(body))).toEqual({ wallet_addresses: [] });
  });

  it("keeps the values the caller did send", () => {
    const body = {
      wallet_addresses: [{ currency: "SOL", address: "So11111111111111111111111111111111111111112" }],
      skills: ["rust"],
    };
    const submitted = pickSubmitted(body, parse(body));
    expect(submitted.skills).toEqual(["rust"]);
    expect(submitted.wallet_addresses).toHaveLength(1);
  });

  it("does not write is_available back to its default when omitted", () => {
    const body = { bio: "hello" };
    expect(pickSubmitted(body, parse(body))).not.toHaveProperty("is_available");
  });
});

describe("buildProfileUpdate", () => {
  it("the exact report from #536 leaves payout addresses untouched", () => {
    const body = { is_available: true };
    const update = buildProfileUpdate(body, parse(body), STORED);

    expect(update).not.toHaveProperty("wallet_addresses");
    expect(update).not.toHaveProperty("skills");
    expect(update).not.toHaveProperty("portfolio_urls");
    expect(update).not.toHaveProperty("ai_tools");
    expect(update.is_available).toBe(true);
  });

  it("the multi-field partial update from #536 also leaves them untouched", () => {
    const body = {
      timezone: "Europe/Zurich",
      location: "Remote (Europe/Zurich)",
      rate_type: "fixed",
      rate_amount: 60,
      rate_unit: "task",
      is_available: true,
    };
    const update = buildProfileUpdate(body, parse(body), STORED);

    expect(update).not.toHaveProperty("wallet_addresses");
    expect(update).not.toHaveProperty("skills");
    expect(update).not.toHaveProperty("portfolio_urls");
    expect(update.timezone).toBe("Europe/Zurich");
    expect(update.rate_amount).toBe(60);
  });

  it("a full body still replaces everything, as it always did", () => {
    const body = {
      full_name: "Lars",
      bio: "new bio",
      skills: ["go"],
      ai_tools: [],
      portfolio_urls: [],
      wallet_addresses: [],
      is_available: false,
    };
    const update = buildProfileUpdate(body, parse(body), STORED);

    expect(update.skills).toEqual(["go"]);
    expect(update.wallet_addresses).toEqual([]);
    expect(update.portfolio_urls).toEqual([]);
    expect(update.is_available).toBe(false);
  });

  it("switching to a human account still clears the agent-only fields", () => {
    const body = { account_type: "human" };
    const update = buildProfileUpdate(body, parse(body), {
      ...STORED,
      account_type: "agent",
      agent_name: "cognilode",
    });

    expect(update.agent_name).toBeNull();
    expect(update.agent_description).toBeNull();
    expect(update.agent_version).toBeNull();
    expect(update.agent_operator_url).toBeNull();
    expect(update.agent_source_url).toBeNull();
    // ...without touching anything else the caller did not name.
    expect(update).not.toHaveProperty("wallet_addresses");
  });

  it("always stamps updated_at", () => {
    const body = { bio: "hi" };
    const update = buildProfileUpdate(body, parse(body), STORED);
    expect(typeof update.updated_at).toBe("string");
  });
});

describe("isProfileComplete", () => {
  it("stays complete when a partial update names none of the completing fields", () => {
    const body = { is_available: true };
    expect(isProfileComplete(pickSubmitted(body, parse(body)), STORED)).toBe(true);
  });

  it("is false when neither the request nor the stored row has anything", () => {
    const body = { is_available: true };
    const empty = { full_name: null, bio: null, skills: [] };
    expect(isProfileComplete(pickSubmitted(body, parse(body)), empty)).toBe(false);
  });

  it("becomes true from the request alone", () => {
    const body = { full_name: "Lars" };
    const empty = { full_name: null, bio: null, skills: [] };
    expect(isProfileComplete(pickSubmitted(body, parse(body)), empty)).toBe(true);
  });
});

describe("resolvedAgentName", () => {
  it("falls back to the stored agent_name when the caller omits it", () => {
    const body = { account_type: "agent" };
    const submitted = pickSubmitted(body, parse(body));
    expect(resolvedAgentName(submitted, { ...STORED, agent_name: "cognilode" })).toBe("cognilode");
  });

  it("is undefined when neither side has one", () => {
    const body = { account_type: "agent" };
    const submitted = pickSubmitted(body, parse(body));
    expect(resolvedAgentName(submitted, { ...STORED, agent_name: null })).toBeFalsy();
  });

  it("prefers what the caller sent", () => {
    const body = { account_type: "agent", agent_name: "newname" };
    const submitted = pickSubmitted(body, parse(body));
    expect(resolvedAgentName(submitted, { ...STORED, agent_name: "oldname" })).toBe("newname");
  });
});
