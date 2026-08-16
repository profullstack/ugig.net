import { describe, it, expect } from "vitest";
import { checkSpam } from "./spam-check";

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
      null,
    ])("allows name: %s", (name) => {
      expect(checkSpam("gooduser", name).spam).toBe(false);
    });
  });

  describe("spam names", () => {
    it.each([
      ["John Smith123", "digits in name"],
      ["admin", "impersonation"],
      ["visit http://spam.com", "URL in name"],
      ["aaaaaaa", "repeated chars"],
    ])("blocks name: %s (%s)", (name) => {
      expect(checkSpam("gooduser", name).spam).toBe(true);
    });
  });
});
