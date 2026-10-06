import { describe, it, expect, vi } from "vitest";
import { filterCompletedApplications, getCompletedApplications } from "./completed-work";

describe("filterCompletedApplications", () => {
  const apps = [
    { id: "filled", gig: { status: "filled" } },
    { id: "paid", gig: { status: "active" } },
    { id: "both", gig: { status: "filled" } },
    { id: "neither", gig: { status: "active" } },
    { id: "no-gig", gig: null },
  ];

  it("keeps hired applications on a filled gig or with a paid invoice", () => {
    const out = filterCompletedApplications(apps, new Set(["paid", "both"]));
    expect(out.map((a) => a.id)).toEqual(["filled", "paid", "both"]);
  });

  it("keeps nothing when no gig is filled and nothing is paid", () => {
    expect(filterCompletedApplications(apps.slice(3), new Set())).toEqual([]);
  });
});

describe("getCompletedApplications", () => {
  it("reads hired applications and paid invoices for the user and normalises joins", async () => {
    const calls: Record<string, unknown[][]> = { applications: [], gig_invoices: [] };
    const chain = (table: string, result: unknown) => {
      const b: any = {
        select: (...a: unknown[]) => (calls[table].push(["select", ...a]), b),
        eq: (...a: unknown[]) => (calls[table].push(["eq", ...a]), table === "gig_invoices" && a[0] === "status" ? Promise.resolve(result) : b),
        in: (...a: unknown[]) => (calls[table].push(["in", ...a]), b),
        order: () => Promise.resolve(result),
      };
      return b;
    };
    const client = {
      from: vi.fn((table: string) =>
        table === "applications"
          ? chain(table, {
              data: [
                { id: "a1", gig_id: "g1", updated_at: "t", status: "completed", gig: [{ id: "g1", title: "T", status: "active", poster: [{ username: "p", full_name: null }] }] },
                { id: "a2", gig_id: "g2", updated_at: "t", status: "accepted", gig: { id: "g2", title: "U", status: "active", poster: null } },
              ],
            })
          : chain(table, { data: [{ application_id: "a1" }] })
      ),
    } as any;

    const out = await getCompletedApplications(client, "user-1");

    expect(out.map((a) => a.id)).toEqual(["a1"]);
    expect(out[0].gig?.poster?.username).toBe("p");
    expect(calls.applications).toContainEqual(["eq", "applicant_id", "user-1"]);
    expect(calls.applications).toContainEqual(["in", "status", ["accepted", "in_progress", "completed", "paid"]]);
    expect(calls.gig_invoices).toContainEqual(["eq", "worker_id", "user-1"]);
    expect(calls.gig_invoices).toContainEqual(["eq", "status", "paid"]);
  });
});
