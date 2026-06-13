import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildCandidatesQuery } from "./candidates";

function createMockSupabase() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["select", "eq", "neq", "not", "or", "order", "range"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  const from = vi.fn().mockReturnValue(chain);
  return { client: { from } as any, chain, from };
}

describe("buildCandidatesQuery", () => {
  let mock: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    mock = createMockSupabase();
  });

  it("queries profiles excluding agents and spam, with confirmed email", () => {
    buildCandidatesQuery(mock.client, {});

    expect(mock.from).toHaveBeenCalledWith("profiles");
    expect(mock.chain.select).toHaveBeenCalledWith("*", { count: "exact" });
    expect(mock.chain.neq).toHaveBeenCalledWith("account_type", "agent");
    expect(mock.chain.not).toHaveBeenCalledWith("email_confirmed_at", "is", null);
    expect(mock.chain.eq).toHaveBeenCalledWith("is_spam", false);
  });

  it("applies search query across full_name, username, and bio", () => {
    buildCandidatesQuery(mock.client, { q: "python,(v1.2)%" });

    expect(mock.chain.or).toHaveBeenCalledWith(
      "full_name.ilike.%python\\,\\(v1\\.2\\)\\%%,username.ilike.%python\\,\\(v1\\.2\\)\\%%,bio.ilike.%python\\,\\(v1\\.2\\)\\%%"
    );
  });

  it("filters by availability when available=true", () => {
    buildCandidatesQuery(mock.client, { available: "true" });

    expect(mock.chain.eq).toHaveBeenCalledWith("is_available", true);
  });

  it("filters by tags on skills and ai_tools", () => {
    buildCandidatesQuery(mock.client, { tags: ["python"] });

    expect(mock.chain.or).toHaveBeenCalledWith('skills.cs.{"python"},ai_tools.cs.{"python"}');
  });

  it("sorts by rate_high descending", () => {
    buildCandidatesQuery(mock.client, { sort: "rate_high" });

    expect(mock.chain.order).toHaveBeenCalledWith("hourly_rate", {
      ascending: false,
      nullsFirst: false,
    });
  });

  it("defaults to newest (created_at descending)", () => {
    buildCandidatesQuery(mock.client, {});

    expect(mock.chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("paginates page 1 with range 0-19", () => {
    buildCandidatesQuery(mock.client, {});

    expect(mock.chain.range).toHaveBeenCalledWith(0, 19);
  });

  it("paginates page 2 with range 20-39", () => {
    buildCandidatesQuery(mock.client, { page: "2" });

    expect(mock.chain.range).toHaveBeenCalledWith(20, 39);
  });

  it("clamps negative page values to page 1", () => {
    buildCandidatesQuery(mock.client, { page: "-1" });

    expect(mock.chain.range).toHaveBeenCalledWith(0, 19);
  });

  it("falls back to page 1 for non-numeric values", () => {
    buildCandidatesQuery(mock.client, { page: "abc" });

    expect(mock.chain.range).toHaveBeenCalledWith(0, 19);
  });

  it("caps very large page values before calculating the range", () => {
    buildCandidatesQuery(mock.client, { page: "999999999" });

    expect(mock.chain.range).toHaveBeenCalledWith(1999980, 1999999);
  });
});
