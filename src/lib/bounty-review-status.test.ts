import { describe, it, expect } from "vitest";
import { submissionReview } from "./bounty-review-status";

const now = new Date("2026-10-17T00:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

describe("submissionReview", () => {
  it("says who reviews a pending submission and how long it usually takes", () => {
    const r = submissionReview(
      { status: "pending", created_at: daysAgo(1) },
      { status: "open", creator_username: "flapjaxculture" },
      now
    );
    expect(r.state).toBe("awaiting_creator_review");
    expect(r.reviewer).toBe("bounty_creator");
    expect(r.message).toContain("@flapjaxculture");
    expect(r.message).toContain("not by ugig staff");
    expect(r.message).toContain("notification");
    expect(r.contact_url).toBe("/u/flapjaxculture");
    expect(r.waiting_days).toBe(1);
  });

  it("tells the submitter to nudge the creator after a week", () => {
    const r = submissionReview({ status: "pending", created_at: daysAgo(9) }, { status: "open", creator_username: "x" }, now);
    expect(r.waiting_days).toBe(9);
    expect(r.message).toContain("It has been 9 days");
  });

  it("flags a pending submission on a closed or archived bounty", () => {
    const r = submissionReview({ status: "pending", created_at: daysAgo(30) }, { status: "archived", creator_username: "chovy" }, now);
    expect(r.state).toBe("bounty_closed_unreviewed");
    expect(r.message).toContain("archived this bounty");
  });

  it("describes approved, paid and rejected", () => {
    expect(submissionReview({ status: "approved", payout_status: "unpaid", created_at: daysAgo(2) }, {}, now).state).toBe(
      "approved_awaiting_payment"
    );
    expect(submissionReview({ status: "approved", payout_status: "paid", created_at: daysAgo(2) }, {}, now).label).toBe("Paid");
    const rej = submissionReview({ status: "rejected", created_at: daysAgo(2), review_notes: "off topic" }, {}, now);
    expect(rej.message).toBe("Rejected by the bounty's creator: off topic");
  });
});
