import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildAgentsQuery } from "./agents";

function createMockSupabase() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["select", "eq", "neq", "not", "or", "order", "range"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  const from = vi.fn().mockReturnValue(chain);
  return { client: { from } as any, chain, from };
}

describe("buildAgentsQuery", () => {
  let mock: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    mock = createMockSupabase();
  });

  it("queries profiles table with agent type, confirmed email, and profile_completed", () => {
    buildAgentsQuery(mock.client, {});

    expect(mock.from).toHaveBeenCalledWith("profiles");
    expect(mock.chain.select).toHaveBeenCalledWith("*", { count: "exact" });
    expect(mock.chain.eq).toHaveBeenCalledWith("account_type", "agent");
    expect(mock.chain.not).toHaveBeenCalledWith("email_confirmed_at", "is", null);
    expect(mock.chain.eq).toHaveBeenCalledWith("profile_completed", true);
  });

  it("does NOT use old bio.neq/skills.neq spam filter", () => {
    buildAgentsQuery(mock.client, {});

    for (const call of mock.chain.or.mock.calls) {
      expect(call[0]).not.toContain("bio.neq");
      expect(call[0]).not.toContain("skills.neq");
    }
  });

  it("applies search query across full_name, username, and bio", () => {
    buildAgentsQuery(mock.client, { q: "typescript" });

    expect(mock.chain.or).toHaveBeenCalledWith(
      "full_name.ilike.%typescript%,username.ilike.%typescript%,bio.ilike.%typescript%"
    );
  });

  it("filters by availability when available=true", () => {
    buildAgentsQuery(mock.client, { available: "true" });

    expect(mock.chain.eq).toHaveBeenCalledWith("is_available", true);
  });

  it("does not filter availability when not specified", () => {
    buildAgentsQuery(mock.client, {});

    expect(mock.chain.eq).not.toHaveBeenCalledWith("is_available", true);
  });

  it("filters by tags on skills and ai_tools", () => {
    buildAgentsQuery(mock.client, { tags: ["react", "node"] });

    expect(mock.chain.or).toHaveBeenCalledWith('skills.cs.{"react"},ai_tools.cs.{"react"}');
    expect(mock.chain.or).toHaveBeenCalledWith('skills.cs.{"node"},ai_tools.cs.{"node"}');
  });

  it("sorts by rate_high descending", () => {
    buildAgentsQuery(mock.client, { sort: "rate_high" });

    expect(mock.chain.order).toHaveBeenCalledWith("hourly_rate", {
      ascending: false,
      nullsFirst: false,
    });
  });

  it("sorts by rate_low ascending", () => {
    buildAgentsQuery(mock.client, { sort: "rate_low" });

    expect(mock.chain.order).toHaveBeenCalledWith("hourly_rate", {
      ascending: true,
      nullsFirst: false,
    });
  });

  it("sorts by oldest ascending", () => {
    buildAgentsQuery(mock.client, { sort: "oldest" });

    expect(mock.chain.order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("defaults to newest (created_at descending)", () => {
    buildAgentsQuery(mock.client, {});

    expect(mock.chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("paginates page 1 with range 0-19", () => {
    buildAgentsQuery(mock.client, {});

    expect(mock.chain.range).toHaveBeenCalledWith(0, 19);
  });

  it("paginates page 2 with range 20-39", () => {
    buildAgentsQuery(mock.client, { page: "2" });

    expect(mock.chain.range).toHaveBeenCalledWith(20, 39);
  });

  it("paginates page 3 with range 40-59", () => {
    buildAgentsQuery(mock.client, { page: "3" });

    expect(mock.chain.range).toHaveBeenCalledWith(40, 59);
  });
});
