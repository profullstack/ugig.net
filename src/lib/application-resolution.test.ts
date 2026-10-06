import { describe, it, expect, vi } from "vitest";
import { rejectOpenApplications } from "./application-resolution";

type Call = { method: string; args: unknown[] };

function fakeClient(open: { id: string; applicant_id: string; status: string; metadata: unknown }[], raced: string[] = []) {
  const queries: Call[][] = [];
  const from = vi.fn(() => {
    const calls: Call[] = [];
    queries.push(calls);
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "update", "eq", "in", "is"]) {
      chain[m] = (...args: unknown[]) => {
        calls.push({ method: m, args });
        return chain;
      };
    }
    chain.then = (ok: (v: unknown) => unknown) => {
      const isUpdate = calls.some((c) => c.method === "update");
      if (!isUpdate) return Promise.resolve({ data: open, error: null }).then(ok);
      const id = calls.find((c) => c.method === "eq")!.args[1] as string;
      return Promise.resolve({ data: raced.includes(id) ? [] : [{ id }], error: null }).then(ok);
    };
    return chain;
  });
  return { client: { from } as never, queries };
}

const now = new Date("2026-10-06T13:00:00Z");

describe("rejectOpenApplications", () => {
  const open = [
    { id: "a1", applicant_id: "w1", status: "pending", metadata: null },
    { id: "a2", applicant_id: "w2", status: "shortlisted", metadata: { tx_id: "keep" } },
  ];

  it("only looks at pending, reviewing and shortlisted applications on the gig", async () => {
    const { client, queries } = fakeClient(open);
    await rejectOpenApplications(client, "gig-1", "gig_closed", { now });
    const select = queries[0];
    expect(select).toContainEqual({ method: "eq", args: ["gig_id", "gig-1"] });
    expect(select).toContainEqual({ method: "in", args: ["status", ["pending", "reviewing", "shortlisted"]] });
    // Held (spam review) applications are left alone.
    expect(select).toContainEqual({ method: "is", args: ["metadata->>held", null] });
  });

  it("rejects each one with the reason, preserving existing metadata", async () => {
    const { client, queries } = fakeClient(open);
    const resolved = await rejectOpenApplications(client, "gig-1", "gig_filled", { now });

    expect(resolved).toEqual([
      { id: "a1", applicant_id: "w1", previous_status: "pending" },
      { id: "a2", applicant_id: "w2", previous_status: "shortlisted" },
    ]);
    const updatesById = Object.fromEntries(
      queries.slice(1).map((calls) => [
        calls.find((c) => c.method === "eq")!.args[1],
        calls.find((c) => c.method === "update")!.args[0],
      ])
    );
    expect(updatesById.a1).toEqual({
      status: "rejected",
      updated_at: "2026-10-06T13:00:00.000Z",
      metadata: { reason: "gig_filled", resolved_at: "2026-10-06T13:00:00.000Z" },
    });
    expect((updatesById.a2 as { metadata: unknown }).metadata).toEqual({
      tx_id: "keep",
      reason: "gig_filled",
      resolved_at: "2026-10-06T13:00:00.000Z",
    });
    // Guarded on still being open
    for (const calls of queries.slice(1)) {
      expect(calls).toContainEqual({ method: "in", args: ["status", ["pending", "reviewing", "shortlisted"]] });
    }
  });

  it("does not report an application that changed status in the meantime", async () => {
    const { client } = fakeClient(open, ["a2"]);
    const resolved = await rejectOpenApplications(client, "gig-1", "gig_closed", { now });
    expect(resolved.map((r) => r.id)).toEqual(["a1"]);
  });

  it("writes nothing in dry-run mode", async () => {
    const { client, queries } = fakeClient(open);
    const resolved = await rejectOpenApplications(client, "gig-1", "gig_closed", { dryRun: true, now });
    expect(resolved).toHaveLength(2);
    expect(queries).toHaveLength(1);
  });
});
