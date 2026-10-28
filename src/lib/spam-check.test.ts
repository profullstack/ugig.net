import { describe, it, expect } from "vitest";
import { checkSpam, checkEmail, plusTag, looksGeneratedTag } from "./spam-check";

describe("checkSpam", () => {
  describe("clean usernames", () => {
    it.each([
      "chovy",
      "riot_coder",
      "alice",
      "dev-bob",
      "jane_doe",
      "coder42",
      "fullstack_dev",
    ])("allows %s", (username) => {
      expect(checkSpam(username).spam).toBe(false);
    });
  });

  describe("spam usernames", () => {
    it.each([
      ["ab12345678", "digit pattern"],
      ["user99999", "user + digits"],
      ["aaaaabbbbb", "repeated chars"],
      ["buycheapstuff", "spam keyword"],
      ["seoagency123", "spam keyword suffix"],
      ["qwrtydfghjklzxcvb", "keyboard mash"],
    ])("blocks %s (%s)", (username) => {
      expect(checkSpam(username).spam).toBe(true);
    });
  });

  describe("high-entropy usernames need a corroborating signal", () => {
    // Entropy scales with length and character diversity, so descriptive names
    // score as high as generated ones. All of these measure above the 3.8
    // threshold and must stay clear on entropy alone.
    it.each([
      "vianerds_scoutworkshop",
      "workbuddy-agent-v2",
      "hermes_autonomous_agent_090334",
      "sokol-data-pipeline-2026",
      "hiveadvise-runner-db9c06",
      "tampahomeworks_f103f",
      "WatchingMyHuman_AI",
      "northstar-evidence-feb1",
      "VantagexAdvisory",
      "orbitopenclaw2026",
    ])("allows descriptive %s", (username) => {
      expect(checkSpam(username).spam).toBe(false);
    });

    it.each([
      ["OisIHtXmpaUjTVzPmY", "random case switching"],
      ["BlQyGebwabqMZMmdOp", "consonant-heavy token"],
      ["xgZbdpNuOclqewkr", "consonant-heavy token"],
      ["gfrGEwzqIEDBENAVUhm", "capital run mid-token"],
      ["termux_agent_pzdrhklp", "unpronounceable cluster despite separator"],
    ])("blocks generated %s (%s)", (username) => {
      expect(checkSpam(username).spam).toBe(true);
    });
  });

  describe("clean names", () => {
    it.each([
      "Anthony Ettinger",
      "José García",
      "Mary-Jane Watson",
      "O'Brien",
      "Иван Петров",
      "王小明",
      null,
      // The profile form saves an empty field as "", which must mean "no name",
      // never "a name with no letters" (check_username_spam, 20261028230000).
      "",
      "   ",
    ])("allows name: %j", (name) => {
      expect(checkSpam("gooduser", name).spam).toBe(false);
    });
  });

  describe("spam names", () => {
    it.each([
      ["John Smith123", "digits in name"],
      ["admin", "impersonation"],
      ["visit http://spam.com", "URL in name"],
      ["aaaaaaa", "repeated chars"],
      ["!!!", "no letters at all"],
    ])("blocks name: %s (%s)", (name) => {
      expect(checkSpam("gooduser", name).spam).toBe(true);
    });
  });
});

describe("checkEmail", () => {
  // The rule this replaces rejected any plus-address whose tag reached ten
  // characters, which turned away a real signup ("3F Rapid Ops") and told it
  // only "Email matches spam pattern". Tagging an address per service is what
  // the feature is for, and the tag is usually the service's name.
  it.each([
    "lenard.m.robinson14+threefrapidops@gmail.com",
    "someone+ugig-signup@gmail.com",
    "someone+profullstack@fastmail.com",
    "first.last@example.com",
    "a+ugig@example.com",
  ])("allows email: %s", (email) => {
    expect(checkEmail(email).spam).toBe(false);
  });

  // Initials followed by digits is one of the most ordinary shapes a real
  // address takes, and it used to be a hard block with no appeal: a reporter's
  // years-old personal address was refused as "Email matches spam pattern".
  // An address is not something a blocked signup can just pick differently.
  it.each([
    ["abc123456789@example.com", "the shape reported as blocked"],
    ["ab123456@example.com", "two initials and a digit run"],
    ["jsm19850612@example.com", "initials and a date of birth"],
    ["kp4155550143@example.com", "initials and a phone fragment"],
    ["xy31415926535@example.com", "initials and digits of pi"],
  ])("allows email: %s (%s)", (email) => {
    expect(checkEmail(email).spam).toBe(false);
  });

  // A 20+ character local part used to be refused on length alone. A project
  // name and a date reach 20 easily: an agent signing up as DataGate Studio
  // was turned away with "Email matches spam pattern".
  it.each([
    ["datagatestudio261016@proton.me", "the address reported as blocked"],
    ["johnsmithwebdeveloper@gmail.com", "words run together"],
    ["elizabethmontgomery1990@yahoo.com", "a full name and a year"],
  ])("allows email: %s (%s)", (email) => {
    expect(checkEmail(email).spam).toBe(false);
  });

  it.each([
    ["x7f2q9k1m4z8p3w6r5t0@example.com", "long random local part"],
    ["qwkzpxmvbtrnlsdfghjk@example.com", "long random letters"],
    ["12345678901234567890@example.com", "too few letters to judge"],
    ["someone+x7f2q9k1m4z8@gmail.com", "generated-looking tag"],
    ["someone@mailinator.com", "disposable domain"],
    ["not-an-email", "no domain"],
  ])("blocks email: %s (%s)", (email) => {
    expect(checkEmail(email).spam).toBe(true);
  });

  it("names the disposable domain rather than blaming the pattern", () => {
    expect(checkEmail("someone@guerrillamail.com").reason).toMatch(/[Dd]isposable/);
  });
});

describe("plusTag and looksGeneratedTag", () => {
  it("reads the tag out of a plus-address, and nothing from a plain one", () => {
    expect(plusTag("a+b@c.com")).toBe("b");
    expect(plusTag("first.last+ugig-signup@gmail.com")).toBe("ugig-signup");
    expect(plusTag("first.last@gmail.com")).toBeNull();
    expect(plusTag("no-at-sign")).toBeNull();
  });

  it("tells a chosen tag from a generated one", () => {
    expect(looksGeneratedTag("threefrapidops")).toBe(false);
    expect(looksGeneratedTag("ugig")).toBe(false);
    expect(looksGeneratedTag("ugig-signup-2026")).toBe(false);
    expect(looksGeneratedTag("x7f2q9k1m4z8")).toBe(true);
    expect(looksGeneratedTag("bcdfghjklmnpqrst")).toBe(true);
  });
});
