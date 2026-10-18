import { describe, it, expect } from "vitest";
import { accountRentalCheck, checkGigListing, forHireAsHiringCheck, virtualCardSpamCheck, VIRTUAL_CARD_SPAM_THRESHOLD } from "./gig-listing-check";

// Real titles and openings from the prod hiring board (2026-10-15).
const VCC = [
  ["Virtual Card For Google Ads Spend Control 10AM", "Get a virtual card for Google Ads designed to help marketers and agencies manage campaign spending remotely."],
  ["Reloadable Virtual Credit Card For Safer Online Checkout 8AM", "Give your marketing team or agency a safer way to manage online purchases with a reloadable virtual credit card."],
  ["Best Reloadable VCC For Separate Marketing Spend 6AM", "Keep campaign expenses separate from your primary bank card with a reloadable virtual payment card built for marketers."],
  ["Meta Ads Virtual Card For Facebook And Instagram Billing 4AM", "Scale Facebook and Instagram advertising with a dedicated meta ads virtual card designed for remote marketing teams."],
];

const OFFERS = [
  ["Spot-check one script for bugs — $5, 6h", "A quick bug-spot pass on a small Python/JS snippet: obvious errors, security smells. 6-hour delivery."],
  ["I will fix one reproducible Python or TypeScript bug with tests in 24h", "Send me your failing script or repo issue and I will reproduce the bug."],
  ["French IVR & Voicemail Greeting (AI Voice) — $0.03, 24h MP3", "Professional French phone greeting. Zero-risk offer: free sample of YOUR text. Launch price $0.03."],
  ["Clean single-page landing site - mobile-friendly, fast delivery - 24h", "FOR-HIRE SERVICE OFFER. I build single-page landing sites. No complex functionality needed. 24h delivery."],
];

const JOBS = [
  ["Need python automation scripts", "Need python scripts written that can interface with Excel spreadsheets. Must be open to feedback."],
  ["Clean Up and Organize Messy Google Doc or Notion Page", "I have existing content in a Google Doc but it's disorganized. I need it restructured."],
  ["I will pay you $5 USD in SOL to integrate CoinPay payments on your ecommerce site.", "Integrate CoinPay and send me the link, I will review it and pay."],
  ["Build a React admin dashboard with charts and user management", "Need a dashboard with charts, roles and audit logs. Deliverables: source, deploy notes."],
  ["Integrate virtual card issuing into our expense app", "We need a developer to build virtual card issuing with the Lithic API into our startup's app."],
  ["SEO Audit Needed for Website - Urgent", "Looking for someone to perform a comprehensive SEO audit of my website."],
];

describe("virtual card spam", () => {
  it.each(VCC)("refuses %s", (title, description) => {
    expect(virtualCardSpamCheck(title, description).score).toBeGreaterThanOrEqual(VIRTUAL_CARD_SPAM_THRESHOLD);
    for (const listingType of ["hiring", "for_hire"] as const) {
      expect(checkGigListing({ title, description, listingType, confirmHiring: true })).toMatchObject({
        ok: false, code: "virtual_card_spam", status: 400,
      });
    }
  });

  it("lets a job building card issuing through", () => {
    const [title, description] = JOBS[4];
    expect(checkGigListing({ title, description, listingType: "hiring" })).toEqual({ ok: true });
  });
});

describe("service offer posted as a job", () => {
  it.each(OFFERS)("sends %s back to be posted as for_hire", (title, description) => {
    const verdict = checkGigListing({ title, description, listingType: "hiring" });
    expect(verdict).toMatchObject({ ok: false, code: "looks_like_for_hire", status: 422, suggested_listing_type: "for_hire" });
  });

  it.each(OFFERS)("accepts %s as a for_hire listing", (title, description) => {
    expect(checkGigListing({ title, description, listingType: "for_hire" })).toEqual({ ok: true });
  });

  it("goes through when the poster confirms it is a job", () => {
    const [title, description] = OFFERS[0];
    expect(checkGigListing({ title, description, listingType: "hiring", confirmHiring: true })).toEqual({ ok: true });
  });

  it.each(JOBS)("leaves the real job %s alone", (title, description) => {
    expect(forHireAsHiringCheck(title, description).score).toBeLessThan(0.6);
    expect(checkGigListing({ title, description, listingType: "hiring" })).toEqual({ ok: true });
  });

  it("does not count a rhetorical 'Need a site?' as hiring language", () => {
    const res = forHireAsHiringCheck("Landing pages — $50, 24h", "Need a landing page? I build them fast. Send me your copy.");
    expect(res.score).toBeGreaterThanOrEqual(0.6);
  });
});

// Offers still on the active hiring board on 2026-10-18 that the 10-15 rules missed.
const OFFERS_2026_10_18 = [
  ["Quick CSV/JSON conversion + validation — 12h, $12", "Fast, correct CSV/JSON conversion and schema validation. Send the file and the target format; you get clean, validated data plus a short note on anything malformed. 12-hour turnaround."],
  ["Source-cited research briefs, decision-ready, 24h delivery", "One bounded research question turned into a decision-ready brief with explicit sources. Delivered as clean Markdown. Fixed price per brief, delivered within 24 hours."],
  ["French Audiobook Narration (AI Voice) — Fiction, E-learning, Meditation — $0.05/min", "Professional French narration with an AI voice. Launch price. What you get: MP3 and WAV files."],
  ["Research Brief in 48 Hours — Any Topic, Comprehensive, Cited", "I research any topic and produce a comprehensive brief with citations."],
  ["SEO-Optimized Blog Post Generation", "I will generate a complete, publication-ready SEO blog post for your website. What's included: keyword-optimized title. Delivery: 24-48 hours."],
  ["AI Research, Technical Writing & Python Automation — $10 fixed (USDC/SOL)", "Research, writing and scripts. My services: research, docs, automation."],
];

// Real job posts that share words with offers; none of these may trip the check.
const JOBS_2026_10_18 = [
  ["Angry Email Rewriter - Turn Rage Into Professionalism", "so basically i write a LOT of angry emails late at night. need an AI that can take my furious rants and make them sound professional. Deliverables: - an interface or tool where i can paste my angry draft and get alternatives back"],
  ["I will pay you to subscribe to my live channel", "Subscribe and leave a comment, you will receive 100 sats for each one."],
  ["Need a logo in 24h", "We need a logo for our startup by tomorrow. You will get paid $40 on delivery."],
  ["Turn 60-90 Minute Video into 10-15 Short Clips for Social Media", "I have a long video and need it cut into short clips. Must be good at captions."],
];

describe("service offers the 2026-10-18 cues catch", () => {
  it.each(OFFERS_2026_10_18)("sends %s back as for_hire", (title, description) => {
    expect(checkGigListing({ title, description, listingType: "hiring" })).toMatchObject({ ok: false, code: "looks_like_for_hire" });
  });

  it.each(JOBS_2026_10_18)("leaves the real job %s alone", (title, description) => {
    expect(checkGigListing({ title, description, listingType: "hiring" })).toEqual({ ok: true });
  });
});

describe("account rental", () => {
  const RENTAL = [
    "I'm looking for U.S. resident who can work with me and get extra money weekly or monthly",
    "We're building AI agency company so we need U.S. resident who can provide AI platform accounts and get salary monthly.",
  ] as const;

  it("refuses a residency requirement plus handing over accounts, on both boards and even with confirm_hiring", () => {
    for (const listingType of ["hiring", "for_hire"] as const) {
      expect(checkGigListing({ title: RENTAL[0], description: RENTAL[1], listingType, confirmHiring: true })).toMatchObject({
        ok: false, code: "account_rental", status: 400,
      });
    }
  });

  it("needs both halves", () => {
    expect(accountRentalCheck("Support agent, US residents only", "Must live in the United States. Remote, full time.").score).toBe(0);
    expect(accountRentalCheck("Set up accounts for our team", "Provide our team with Google Workspace accounts and SSO.").score).toBe(0);
    expect(accountRentalCheck("QA tester", "US citizens preferred. You will create test accounts on staging.").score).toBe(0);
  });
});
