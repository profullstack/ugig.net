import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkAutoVerification, autoVerifyUser } from "./check";

// ── Mock Supabase Client Builder ───────────────────────────────────

function createMockSupabase({
  profile = { id: "user-1", verified: false, created_at: "2024-01-01T00:00:00Z" } as { id: string; verified: boolean; created_at: string } | null,
  profileError = null as { message: string } | null,
  completedGigsCount = 0 as number | null,
  reviews = [] as { rating: number }[] | null,
  updateError = null as { message: string } | null,
}: {
  profile?: { id: string; verified: boolean; created_at: string } | null;
  profileError?: { message: string } | null;
  completedGigsCount?: number | null;
  reviews?: { rating: number }[] | null;
  updateError?: { message: string } | null;
} = {}) {
  const updateChain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: updateError }),
  };

  let fromCallCount = 0;

  const supabase = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "profiles") {
        fromCallCount++;
        // First profiles call is the select, subsequent ones could be update
        if (fromCallCount === 1 || (fromCallCount > 1 && table === "profiles")) {
          // Check if this is being used for update (after check) or select
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: profile,
                  error: profileError,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: updateError }),
            }),
          };
        }
      }
      if (table === "applications") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  count: completedGigsCount,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "reviews") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: reviews,
            }),
          }),
        };
      }
      return {};
    }),
  };

  return supabase as any;
}

// ── Tests ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2024-06-01T00:00:00Z"));
});

describe("checkAutoVerification", () => {
  it("returns eligible=true when all criteria are met", async () => {
    const supabase = createMockSupabase({
      profile: { id: "user-1", verified: false, created_at: "2024-01-01T00:00:00Z" },
      completedGigsCount: 5,
      reviews: [{ rating: 5 }, { rating: 4 }, { rating: 4.5 }],
    });

    const result = await checkAutoVerification(supabase, "user-1");

    expect(result.eligible).toBe(true);
    expect(result.alreadyVerified).toBe(false);
    expect(result.criteria.completedGigs.met).toBe(true);
    expect(result.criteria.completedGigs.value).toBe(5);
    expect(result.criteria.averageRating.met).toBe(true);
    expect(result.criteria.averageRating.value).toBe(4.5);
    expect(result.criteria.accountAge.met).toBe(true);
    expect(result.criteria.accountAge.value).toBeGreaterThanOrEqual(7);
  });

  it("returns eligible=false when completed gigs < 3", async () => {
    const supabase = createMockSupabase({
      profile: { id: "user-1", verified: false, created_at: "2024-01-01T00:00:00Z" },
      completedGigsCount: 2,
      reviews: [{ rating: 5 }, { rating: 5 }],
    });

    const result = await checkAutoVerification(supabase, "user-1");

    expect(result.eligible).toBe(false);
    expect(result.criteria.completedGigs.met).toBe(false);
    expect(result.criteria.completedGigs.value).toBe(2);
    expect(result.criteria.completedGigs.required).toBe(3);
  });

  it("returns eligible=false when average rating < 4.0", async () => {
    const supabase = createMockSupabase({
      profile: { id: "user-1", verified: false, created_at: "2024-01-01T00:00:00Z" },
      completedGigsCount: 5,
      reviews: [{ rating: 3 }, { rating: 3 }, { rating: 3.5 }],
    });

    const result = await checkAutoVerification(supabase, "user-1");

    expect(result.eligible).toBe(false);
    expect(result.criteria.averageRating.met).toBe(false);
    expect(result.criteria.averageRating.value).toBeCloseTo(3.167, 2);
    expect(result.criteria.averageRating.required).toBe(4.0);
  });

  it("returns eligible=false when account age < 7 days", async () => {
    const supabase = createMockSupabase({
      profile: { id: "user-1", verified: false, created_at: "2024-05-28T00:00:00Z" },
      completedGigsCount: 5,
      reviews: [{ rating: 5 }, { rating: 5 }],
    });

    const result = await checkAutoVerification(supabase, "user-1");

    expect(result.eligible).toBe(false);
    expect(result.criteria.accountAge.met).toBe(false);
    expect(result.criteria.accountAge.value).toBe(4);
    expect(result.criteria.accountAge.required).toBe(7);
  });

  it("returns alreadyVerified=true when profile is already verified", async () => {
    const supabase = createMockSupabase({
      profile: { id: "user-1", verified: true, created_at: "2024-01-01T00:00:00Z" },
    });

    const result = await checkAutoVerification(supabase, "user-1");

    expect(result.eligible).toBe(false);
    expect(result.alreadyVerified).toBe(true);
  });

  it("handles no reviews (null avg rating)", async () => {
    const supabase = createMockSupabase({
      profile: { id: "user-1", verified: false, created_at: "2024-01-01T00:00:00Z" },
      completedGigsCount: 5,
      reviews: [],
    });

    const result = await checkAutoVerification(supabase, "user-1");

    expect(result.eligible).toBe(false);
    expect(result.criteria.averageRating.met).toBe(false);
    expect(result.criteria.averageRating.value).toBeNull();
  });

  it("handles zero completed gigs", async () => {
    const supabase = createMockSupabase({
      profile: { id: "user-1", verified: false, created_at: "2024-01-01T00:00:00Z" },
      completedGigsCount: 0,
      reviews: [],
    });

    const result = await checkAutoVerification(supabase, "user-1");

    expect(result.eligible).toBe(false);
    expect(result.criteria.completedGigs.met).toBe(false);
    expect(result.criteria.completedGigs.value).toBe(0);
  });

  it("handles null count from supabase (no matching rows)", async () => {
    const supabase = createMockSupabase({
      profile: { id: "user-1", verified: false, created_at: "2024-01-01T00:00:00Z" },
      completedGigsCount: null,
      reviews: [{ rating: 5 }],
    });

    const result = await checkAutoVerification(supabase, "user-1");

    expect(result.criteria.completedGigs.met).toBe(false);
    expect(result.criteria.completedGigs.value).toBe(0);
  });

  it("throws when profile not found", async () => {
    const supabase = createMockSupabase({
      profile: null,
    });

    await expect(checkAutoVerification(supabase, "nonexistent")).rejects.toThrow(
      "Profile not found"
    );
  });

  it("returns exactly met thresholds as eligible", async () => {
    // Exactly 3 gigs, exactly 4.0 rating, exactly 7 days old
    const supabase = createMockSupabase({
      profile: { id: "user-1", verified: false, created_at: "2024-05-25T00:00:00Z" },
      completedGigsCount: 3,
      reviews: [{ rating: 4 }, { rating: 4 }],
    });

    const result = await checkAutoVerification(supabase, "user-1");

    expect(result.eligible).toBe(true);
    expect(result.criteria.completedGigs.met).toBe(true);
    expect(result.criteria.completedGigs.value).toBe(3);
    expect(result.criteria.averageRating.met).toBe(true);
    expect(result.criteria.averageRating.value).toBe(4.0);
    expect(result.criteria.accountAge.met).toBe(true);
    expect(result.criteria.accountAge.value).toBe(7);
  });

  it("returns detailed per-criterion status even when ineligible", async () => {
    const supabase = createMockSupabase({
      profile: { id: "user-1", verified: false, created_at: "2024-05-30T00:00:00Z" },
      completedGigsCount: 1,
      reviews: [{ rating: 3 }],
    });

    const result = await checkAutoVerification(supabase, "user-1");

    expect(result.eligible).toBe(false);
    expect(result.criteria).toEqual({
      completedGigs: { met: false, value: 1, required: 3 },
      averageRating: { met: false, value: 3, required: 4.0 },
      accountAge: { met: false, value: 2, required: 7 },
    });
  });
});

describe("autoVerifyUser", () => {
  it("verifies user and returns verified=true when eligible", async () => {
    // We need a more nuanced mock here since autoVerifyUser calls checkAutoVerification
    // then does an update
    let profileFromCount = 0;
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "profiles") {
          profileFromCount++;
          if (profileFromCount === 1) {
            // First call: select profile in checkAutoVerification
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: "user-1", verified: false, created_at: "2024-01-01T00:00:00Z" },
                    error: null,
                  }),
                }),
              }),
            };
          } else {
            // Second call: update profile
            return {
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
        }
        if (table === "applications") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ count: 5 }),
                }),
              }),
            }),
          };
        }
        if (table === "reviews") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ rating: 5 }, { rating: 4 }],
              }),
            }),
          };
        }
        return {};
      }),
    } as any;

    const { verified, result } = await autoVerifyUser(supabase, "user-1");

    expect(verified).toBe(true);
    expect(result.eligible).toBe(true);
  });

  it("does not verify user and returns verified=false when ineligible", async () => {
    const supabase = createMockSupabase({
      profile: { id: "user-1", verified: false, created_at: "2024-01-01T00:00:00Z" },
      completedGigsCount: 1,
      reviews: [{ rating: 5 }],
    });

    const { verified, result } = await autoVerifyUser(supabase, "user-1");

    expect(verified).toBe(false);
    expect(result.eligible).toBe(false);
  });

  it("throws when update fails", async () => {
    let profileFromCount = 0;
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "profiles") {
          profileFromCount++;
          if (profileFromCount === 1) {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: "user-1", verified: false, created_at: "2024-01-01T00:00:00Z" },
                    error: null,
                  }),
                }),
              }),
            };
          } else {
            return {
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: { message: "DB write failed" } }),
              }),
            };
          }
        }
        if (table === "applications") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ count: 5 }),
                }),
              }),
            }),
          };
        }
        if (table === "reviews") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ rating: 5 }, { rating: 5 }],
              }),
            }),
          };
        }
        return {};
      }),
    } as any;

    await expect(autoVerifyUser(supabase, "user-1")).rejects.toThrow(
      "Failed to update verification: DB write failed"
    );
  });
});
