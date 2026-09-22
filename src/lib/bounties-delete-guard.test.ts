import { describe, it, expect } from "vitest";
import { bountyDeleteBlockReason, BOUNTY_STATUSES, updateBountySchema } from "./bounties";

describe("bountyDeleteBlockReason", () => {
  it("allows deletion with no submissions", () => {
    expect(bountyDeleteBlockReason([])).toBeNull();
  });

  it("allows deletion when every submission is pending or rejected and unpaid", () => {
    expect(
      bountyDeleteBlockReason([
        { status: "pending", payout_status: "unpaid" },
        { status: "rejected", payout_status: "unpaid" },
      ])
    ).toBeNull();
  });

  it("blocks on a paid submission", () => {
    expect(
      bountyDeleteBlockReason([{ status: "approved", payout_status: "paid" }])
    ).toMatch(/1 paid or invoiced submission\./);
  });

  it("blocks on an invoiced submission", () => {
    expect(
      bountyDeleteBlockReason([{ status: "approved", payout_status: "invoiced" }])
    ).toMatch(/paid or invoiced/);
  });

  it("blocks on an approved submission that is still owed", () => {
    expect(
      bountyDeleteBlockReason([{ status: "approved", payout_status: "unpaid" }])
    ).toMatch(/1 approved submission still unpaid/);
  });

  it("does not count a rejected payout as money moved", () => {
    // payout_status 'rejected' means the creator refused to pay after approval
    // (e.g. no wallet to send to); nothing was invoiced or sent, so nothing
    // is owed and no payment record is lost by deleting.
    expect(
      bountyDeleteBlockReason([{ status: "approved", payout_status: "rejected" }])
    ).toBeNull();
  });

  it("names both counts, pluralised", () => {
    expect(
      bountyDeleteBlockReason([
        { status: "approved", payout_status: "paid" },
        { status: "approved", payout_status: "paid" },
        { status: "approved", payout_status: "unpaid" },
      ])
    ).toBe(
      "This bounty has 2 paid or invoiced submissions and 1 approved submission still unpaid. Payment records are kept, so it cannot be deleted; archive it instead."
    );
  });
});

describe("bounty status", () => {
  it("includes archived", () => {
    expect(BOUNTY_STATUSES).toContain("archived");
    expect(updateBountySchema.safeParse({ status: "archived" }).success).toBe(true);
    expect(updateBountySchema.safeParse({ status: "deleted" }).success).toBe(false);
  });
});
