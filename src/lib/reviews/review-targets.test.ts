import { describe, it, expect } from "vitest";
import { getReviewTargets, type ReviewTargetPerson } from "./review-targets";

const person = (id: string): ReviewTargetPerson => ({
  id,
  username: id,
  full_name: null,
  avatar_url: null,
});

const poster = person("poster");
const w1 = person("w1");
const w2 = person("w2");

describe("getReviewTargets", () => {
  it("gives the poster one target per hired worker", () => {
    const targets = getReviewTargets({
      currentUserId: "poster",
      poster,
      hiredWorkers: [w1, w2],
      reviewedIds: [],
    });
    expect(targets.map((t) => t.id)).toEqual(["w1", "w2"]);
  });

  it("gives a hired worker the poster", () => {
    const targets = getReviewTargets({
      currentUserId: "w1",
      poster,
      hiredWorkers: [w1, w2],
      reviewedIds: [],
    });
    expect(targets.map((t) => t.id)).toEqual(["poster"]);
  });

  it("gives a non-hired visitor, or a logged-out one, nobody", () => {
    expect(
      getReviewTargets({ currentUserId: "stranger", poster, hiredWorkers: [w1], reviewedIds: [] })
    ).toEqual([]);
    expect(
      getReviewTargets({ currentUserId: null, poster, hiredWorkers: [w1], reviewedIds: [] })
    ).toEqual([]);
  });

  it("hides anyone this user already reviewed for the gig", () => {
    expect(
      getReviewTargets({ currentUserId: "poster", poster, hiredWorkers: [w1, w2], reviewedIds: ["w1"] }).map((t) => t.id)
    ).toEqual(["w2"]);
    expect(
      getReviewTargets({ currentUserId: "w1", poster, hiredWorkers: [w1], reviewedIds: ["poster"] })
    ).toEqual([]);
  });

  it("never offers a self review and de-duplicates workers", () => {
    expect(
      getReviewTargets({ currentUserId: "poster", poster, hiredWorkers: [poster, w1, w1], reviewedIds: [] }).map((t) => t.id)
    ).toEqual(["w1"]);
  });
});
