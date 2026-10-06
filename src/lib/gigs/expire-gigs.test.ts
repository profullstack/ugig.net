import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const { mockSendEmail } = vi.hoisted(() => ({ mockSendEmail: vi.fn() }));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail: mockSendEmail,
}));

import { expireGigs, EXPIRE_GIGS_BATCH } from "./expire-gigs";

const NOW = new Date("2026-10-06T12:00:00.000Z");

type Gig = {
  id: string;
  title: string;
  poster_id: string;
  listing_type: string;
  applications_count: number;
  expires_at: string;
  poster: { full_name: string | null; username: string | null };
};

function gig(id: string, overrides: Partial<Gig> = {}): Gig {
  return {
    id,
    title: `Gig ${id}`,
    poster_id: `poster-${id}`,
    listing_type: "hiring",
    applications_count: 3,
    expires_at: "2026-10-05T00:00:00.000Z",
    poster: { full_name: "Pat Poster", username: "pat" },
    ...overrides,
  };
}

/**
 * Fake client:
 *  - gigs select → `due`
 *  - gigs update → paused row unless the id is in `alreadyChanged`
 *  - notification_settings → `settings[user]` (no row = enabled)
 *  - auth.admin.getUserById → an address per poster unless in `noEmail`
 */
function fakeClient(opts: {
  due: Gig[];
  alreadyChanged?: string[];
  settings?: Record<string, Record<string, boolean>>;
  noEmail?: string[];
  selectError?: { message: string };
}) {
  const selectCalls: [string, unknown[]][] = [];
  const updates: { payload: Record<string, unknown>; filters: [string, unknown[]][] }[] = [];

  const client = {
    from(table: string) {
      const filters: [string, unknown[]][] = [];
      let payload: Record<string, unknown> | null = null;
      let userId: string | null = null;
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "lt", "order", "limit"]) {
        b[m] = (...args: unknown[]) => {
          filters.push([m, args]);
          if (table === "gigs" && !payload) selectCalls.push([m, args]);
          if (table === "notification_settings" && m === "eq") userId = args[1] as string;
          return b;
        };
      }
      b.update = (p: Record<string, unknown>) => {
        payload = p;
        return b;
      };
      b.single = () =>
        Promise.resolve(
          userId && opts.settings?.[userId]
            ? { data: opts.settings[userId], error: null }
            : { data: null, error: { message: "no rows" } }
        );
      b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        let result: unknown;
        if (table === "gigs" && payload) {
          const id = filters.find(([m, a]) => m === "eq" && a[0] === "id")?.[1][1] as string;
          updates.push({ payload, filters });
          result = { data: opts.alreadyChanged?.includes(id) ? [] : [{ id }], error: null };
        } else if (table === "gigs") {
          result = opts.selectError ? { data: null, error: opts.selectError } : { data: opts.due, error: null };
        } else {
          result = { data: null, error: null };
        }
        return Promise.resolve(result).then(resolve, reject);
      };
      return b;
    },
    auth: {
      admin: {
        getUserById: vi.fn(async (id: string) => ({
          data: { user: opts.noEmail?.includes(id) ? { email: null } : { email: `${id}@example.test` } },
        })),
      },
    },
  };
  return { client: client as unknown as SupabaseClient, selectCalls, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendEmail.mockResolvedValue({ success: true });
});

describe("expireGigs", () => {
  it("selects active gigs past expires_at, oldest first, in a bounded batch", async () => {
    const { client, selectCalls } = fakeClient({ due: [] });
    await expireGigs(client, { now: NOW });
    expect(selectCalls).toContainEqual(["eq", ["status", "active"]]);
    expect(selectCalls).toContainEqual(["lt", ["expires_at", NOW.toISOString()]]);
    expect(selectCalls).toContainEqual(["order", ["expires_at", { ascending: true }]]);
    expect(selectCalls).toContainEqual(["limit", [EXPIRE_GIGS_BATCH]]);
  });

  it("pauses each due gig with a guarded update and emails its poster once", async () => {
    const { client, updates } = fakeClient({ due: [gig("1"), gig("2", { listing_type: "for_hire" })] });

    const result = await expireGigs(client, { now: NOW });

    expect(result).toMatchObject({ found: 2, paused: 2, emailed: 2, email_skipped: 0, dry_run: false });
    expect(updates).toHaveLength(2);
    expect(updates[0].payload).toEqual({ status: "paused", updated_at: NOW.toISOString() });
    // Only an active, still-expired gig is paused (no double pause / double mail).
    expect(updates[0].filters).toContainEqual(["eq", ["status", "active"]]);
    expect(updates[0].filters).toContainEqual(["lt", ["expires_at", NOW.toISOString()]]);

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    const first = mockSendEmail.mock.calls[0][0];
    expect(first.to).toBe("poster-1@example.test");
    expect(first.subject).toContain("Gig 1");
    expect(first.text).toContain("/gigs/1#renew");
    expect(first.text).toContain("Renew it for another 30 days");
    expect(first.text).toContain("3 applications");
    expect(first.unsubscribe).toEqual({ userId: "poster-1", setting: "email_gig_updates" });
    // An ad renews for 60.
    expect(mockSendEmail.mock.calls[1][0].text).toContain("another 60 days");
  });

  it("does not email when the gig was renewed or changed between select and update", async () => {
    const { client } = fakeClient({ due: [gig("1")], alreadyChanged: ["1"] });
    const result = await expireGigs(client, { now: NOW });
    expect(result).toMatchObject({ found: 1, paused: 0, emailed: 0 });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("pauses but does not email a poster who turned off gig update emails", async () => {
    const { client } = fakeClient({
      due: [gig("1")],
      settings: { "poster-1": { email_gig_updates: false } },
    });
    const result = await expireGigs(client, { now: NOW });
    expect(result).toMatchObject({ paused: 1, emailed: 0, email_skipped: 1 });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("skips the email when the poster has no address", async () => {
    const { client } = fakeClient({ due: [gig("1")], noEmail: ["poster-1"] });
    const result = await expireGigs(client, { now: NOW });
    expect(result).toMatchObject({ paused: 1, emailed: 0, email_skipped: 1 });
  });

  it("counts a provider failure without stopping the run", async () => {
    mockSendEmail.mockResolvedValueOnce({ success: false, error: "down" });
    const { client } = fakeClient({ due: [gig("1"), gig("2")] });
    const result = await expireGigs(client, { now: NOW });
    expect(result).toMatchObject({ paused: 2, emailed: 1, email_failed: 1 });
  });

  it("dry run lists due gigs and changes nothing", async () => {
    const { client, updates } = fakeClient({ due: [gig("1")] });
    const result = await expireGigs(client, { now: NOW, dryRun: true });
    expect(result).toMatchObject({ dry_run: true, found: 1, paused: 0, emailed: 0 });
    expect(result.gigs).toEqual([{ id: "1", listing_type: "hiring", expires_at: "2026-10-05T00:00:00.000Z" }]);
    expect(updates).toHaveLength(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("throws when the select fails", async () => {
    const { client } = fakeClient({ due: [], selectError: { message: "db down" } });
    await expect(expireGigs(client, { now: NOW })).rejects.toThrow("db down");
  });
});
