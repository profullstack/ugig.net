import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Blocking is only as good as its least-guarded surface: the gig comments route
 * emailed blocked-from posters for months because it simply never asked. Every
 * route that notifies a specific person on someone else's behalf has to consult
 * `@/lib/blocks`, so pin that list here — a new one shows up as a failure rather
 * than as mail in someone's inbox.
 */
const GUARDED_ROUTES = [
  "src/app/api/gigs/[id]/comments/route.ts",
  "src/app/api/posts/[id]/comments/route.ts",
  "src/app/api/applications/route.ts",
  "src/app/api/gigs/[id]/applications/route.ts",
  "src/app/api/gigs/[id]/applications/message-all/route.ts",
  "src/app/api/users/[username]/endorse/route.ts",
  "src/app/api/users/[username]/follow/route.ts",
  "src/app/api/reviews/route.ts",
  "src/app/api/testimonials/route.ts",
  "src/app/api/video-calls/route.ts",
  "src/app/api/messages/send/route.ts",
  "src/app/api/messages/broadcast/route.ts",
  "src/app/api/conversations/route.ts",
  "src/app/api/conversations/[id]/messages/route.ts",
];

describe("block enforcement coverage", () => {
  it.each(GUARDED_ROUTES)("%s consults the block list", (route) => {
    const source = readFileSync(join(process.cwd(), route), "utf8");
    expect(source).toContain("@/lib/blocks");
  });
});
