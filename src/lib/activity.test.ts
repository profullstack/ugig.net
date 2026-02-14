import { describe, it, expect, vi, beforeEach } from "vitest";
import { logActivity } from "./activity";

// ── Helpers ────────────────────────────────────────────────────────

function makeMockSupabase(insertResult: { error: unknown } = { error: null }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn().mockReturnValue({ insert });
  return { from, insert };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("logActivity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("inserts correct data into activities table", async () => {
    const { from, insert } = makeMockSupabase();
    const supabase = { from } as never;

    await logActivity(supabase, {
      userId: "user-1",
      activityType: "gig_posted",
      referenceId: "gig-1",
      referenceType: "gig",
      metadata: { gig_title: "Test Gig" },
      isPublic: true,
    });

    expect(from).toHaveBeenCalledWith("activities");
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      activity_type: "gig_posted",
      reference_id: "gig-1",
      reference_type: "gig",
      metadata: { gig_title: "Test Gig" },
      is_public: true,
    });
  });

  it("defaults optional fields correctly", async () => {
    const { insert } = makeMockSupabase();
    const supabase = { from: vi.fn().mockReturnValue({ insert }) } as never;

    await logActivity(supabase, {
      userId: "user-2",
      activityType: "post_created",
    });

    expect(insert).toHaveBeenCalledWith({
      user_id: "user-2",
      activity_type: "post_created",
      reference_id: null,
      reference_type: null,
      metadata: {},
      is_public: true,
    });
  });

  it("respects isPublic: false", async () => {
    const { insert } = makeMockSupabase();
    const supabase = { from: vi.fn().mockReturnValue({ insert }) } as never;

    await logActivity(supabase, {
      userId: "user-3",
      activityType: "followed_user",
      isPublic: false,
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ is_public: false })
    );
  });

  it("does not throw on supabase error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { from } = makeMockSupabase({ error: { message: "DB down" } });
    const supabase = { from } as never;

    await expect(
      logActivity(supabase, { userId: "u", activityType: "gig_posted" })
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      "[activity] Failed to log activity:",
      "DB down"
    );
  });

  it("does not throw on unexpected exception", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockRejectedValue(new Error("network failure")),
      }),
    } as never;

    await expect(
      logActivity(supabase, { userId: "u", activityType: "gig_posted" })
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      "[activity] Unexpected error logging activity:",
      expect.any(Error)
    );
  });
});
