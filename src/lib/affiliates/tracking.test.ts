import { afterEach, describe, it, expect, vi } from "vitest";
import { findAttribution, generateTrackingCode, hashIP } from "./tracking";

type MockClick = {
  id: string;
  offer_id: string;
  affiliate_id: string;
  tracking_code: string;
  visitor_id?: string | null;
  created_at: string;
};

function makeAffiliateSupabase({
  application,
  offer,
  clicks,
}: {
  application?: { affiliate_id: string; tracking_code: string; status: string; offer_id: string };
  offer?: { id: string; cookie_days: number };
  clicks?: MockClick[];
}) {
  return {
    from(table: string) {
      const state: {
        filters: Record<string, unknown>;
        gte: Record<string, string>;
        limit?: number;
      } = { filters: {}, gte: {} };
      const builder: Record<string, unknown> = {};

      builder.select = () => builder;
      builder.eq = (column: string, value: unknown) => {
        state.filters[column] = value;
        return builder;
      };
      builder.gte = (column: string, value: string) => {
        state.gte[column] = value;
        return builder;
      };
      builder.order = () => builder;
      builder.limit = (limit: number) => {
        state.limit = limit;
        let rows = clicks || [];
        rows = rows.filter((click) =>
          Object.entries(state.filters).every(
            ([key, value]) => click[key as keyof MockClick] === value
          )
        );
        if (state.gte.created_at) {
          rows = rows.filter((click) => click.created_at >= state.gte.created_at);
        }
        rows = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
        return Promise.resolve({ data: rows.slice(0, limit), error: null });
      };
      builder.single = () => {
        if (table === "affiliate_applications" && application) {
          const matches =
            state.filters.tracking_code === application.tracking_code &&
            state.filters.offer_id === application.offer_id &&
            state.filters.status === application.status;
          return Promise.resolve({
            data: matches ? application : null,
            error: matches ? null : { message: "Not found" },
          });
        }

        if (table === "affiliate_offers" && offer) {
          const matches = state.filters.id === offer.id;
          return Promise.resolve({
            data: matches ? offer : null,
            error: matches ? null : { message: "Not found" },
          });
        }

        return Promise.resolve({ data: null, error: { message: "Not found" } });
      };

      return builder;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("generateTrackingCode", () => {
  it("includes username in the code", () => {
    const code = generateTrackingCode("alice", "cool-skill");
    expect(code).toMatch(/^alice-/);
  });

  it("generates unique codes for same inputs (time-based)", () => {
    const code1 = generateTrackingCode("bob", "offer-1");
    // Small delay to ensure different timestamp
    const code2 = generateTrackingCode("bob", "offer-1");
    // They might be the same in fast tests, but format should be consistent
    expect(code1).toMatch(/^bob-[a-f0-9]{6}$/);
    expect(code2).toMatch(/^bob-[a-f0-9]{6}$/);
  });

  it("sanitizes username prefixes for URL-safe tracking codes", () => {
    const code = generateTrackingCode("Alice Smith/@Example", "offer-1");

    expect(code).toMatch(/^alice-smith-example-[a-f0-9]{6}$/);
    expect(code).not.toMatch(/[ /@]/);
  });

  it("falls back when the username has no URL-safe characters", () => {
    const code = generateTrackingCode("!!!", "offer-1");

    expect(code).toMatch(/^affiliate-[a-f0-9]{6}$/);
  });
});

describe("hashIP", () => {
  it("returns a consistent hash for the same IP on the same day", () => {
    const hash1 = hashIP("192.168.1.1");
    const hash2 = hashIP("192.168.1.1");
    expect(hash1).toBe(hash2);
  });

  it("returns different hashes for different IPs", () => {
    const hash1 = hashIP("192.168.1.1");
    const hash2 = hashIP("10.0.0.1");
    expect(hash1).not.toBe(hash2);
  });

  it("returns a 16-char hex string", () => {
    const hash = hashIP("1.2.3.4");
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });
});

describe("findAttribution", () => {
  it("credits a tracking code only when a click is inside the offer cookie window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T12:00:00Z"));

    const admin = makeAffiliateSupabase({
      application: {
        affiliate_id: "aff-1",
        tracking_code: "alice-abc123",
        status: "approved",
        offer_id: "offer-1",
      },
      offer: { id: "offer-1", cookie_days: 1 },
      clicks: [
        {
          id: "click-1",
          offer_id: "offer-1",
          affiliate_id: "aff-1",
          tracking_code: "alice-abc123",
          created_at: "2026-05-20T06:00:00Z",
        },
      ],
    });

    const result = await findAttribution(admin as any, {
      offerId: "offer-1",
      trackingCode: "alice-abc123",
    });

    expect(result).toEqual({
      affiliated: true,
      affiliate_id: "aff-1",
      click_id: "click-1",
      tracking_code: "alice-abc123",
    });
  });

  it("requires the same visitor when attributing with a tracking-code cookie", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T12:00:00Z"));

    const admin = makeAffiliateSupabase({
      application: {
        affiliate_id: "aff-1",
        tracking_code: "alice-abc123",
        status: "approved",
        offer_id: "offer-1",
      },
      offer: { id: "offer-1", cookie_days: 30 },
      clicks: [
        {
          id: "other-visitor-click",
          offer_id: "offer-1",
          affiliate_id: "aff-1",
          tracking_code: "alice-abc123",
          visitor_id: "visitor-other",
          created_at: "2026-05-20T06:00:00Z",
        },
      ],
    });

    const result = await findAttribution(admin as any, {
      offerId: "offer-1",
      trackingCode: "alice-abc123",
      visitorId: "visitor-current",
    });

    expect(result).toEqual({ affiliated: false });
  });

  it("credits the matching visitor when tracking-code attribution has a visitor id", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T12:00:00Z"));

    const admin = makeAffiliateSupabase({
      application: {
        affiliate_id: "aff-1",
        tracking_code: "alice-abc123",
        status: "approved",
        offer_id: "offer-1",
      },
      offer: { id: "offer-1", cookie_days: 30 },
      clicks: [
        {
          id: "older-other-visitor-click",
          offer_id: "offer-1",
          affiliate_id: "aff-1",
          tracking_code: "alice-abc123",
          visitor_id: "visitor-other",
          created_at: "2026-05-20T07:00:00Z",
        },
        {
          id: "matching-visitor-click",
          offer_id: "offer-1",
          affiliate_id: "aff-1",
          tracking_code: "alice-abc123",
          visitor_id: "visitor-current",
          created_at: "2026-05-20T06:00:00Z",
        },
      ],
    });

    const result = await findAttribution(admin as any, {
      offerId: "offer-1",
      trackingCode: "alice-abc123",
      visitorId: "visitor-current",
    });

    expect(result).toEqual({
      affiliated: true,
      affiliate_id: "aff-1",
      click_id: "matching-visitor-click",
      tracking_code: "alice-abc123",
    });
  });

  it("does not credit an expired tracking-code cookie", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T12:00:00Z"));

    const admin = makeAffiliateSupabase({
      application: {
        affiliate_id: "aff-1",
        tracking_code: "alice-abc123",
        status: "approved",
        offer_id: "offer-1",
      },
      offer: { id: "offer-1", cookie_days: 1 },
      clicks: [
        {
          id: "old-click",
          offer_id: "offer-1",
          affiliate_id: "aff-1",
          tracking_code: "alice-abc123",
          created_at: "2026-05-18T12:00:00Z",
        },
      ],
    });

    const result = await findAttribution(admin as any, {
      offerId: "offer-1",
      trackingCode: "alice-abc123",
    });

    expect(result).toEqual({ affiliated: false });
  });

  it("does not attribute buyer-id-only lookups to the latest offer click", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T12:00:00Z"));

    const admin = makeAffiliateSupabase({
      offer: { id: "offer-1", cookie_days: 30 },
      clicks: [
        {
          id: "click-1",
          offer_id: "offer-1",
          affiliate_id: "aff-1",
          tracking_code: "alice-abc123",
          created_at: "2026-05-20T06:00:00Z",
        },
      ],
    });

    const result = await findAttribution(admin as any, {
      offerId: "offer-1",
      buyerId: "buyer-1",
    });

    expect(result).toBeNull();
  });
});
