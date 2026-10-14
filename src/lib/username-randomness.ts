/**
 * Does a username read as words or a name, or as letters typed at random?
 *
 * The bot wave of October 2026 signed up as `kdrmtwwz`, `ljokjvnp`,
 * `bijxqdwi`: eight random lowercase letters, hundreds of times. Matching that
 * *shape* (8 lowercase letters) would turn away `smartfox` and `xingkong`, and
 * every shape rule in spam-check.ts has eventually blocked a real person
 * (#531, #549, #564). So this measures *randomness* instead.
 *
 * The model is a letter-trigram table trained on English words, first names,
 * surnames, and pinyin / Japanese / Korean syllables (see
 * scripts/build-username-model.mjs). Each next letter scores the log of how
 * much more likely it is under that model than under a uniformly random
 * letter. Words and names sum well above zero; random letters sum well below
 * it, and the gap grows with length, so short names are never judged on thin
 * evidence.
 *
 * Only letters-only handles of at least MIN_LETTERS are judged. A separator or
 * a digit means a person (or an agent) composed the name from parts, and
 * generated agent suffixes like `hermes-x7f2` are a different question.
 */
import {
  MODEL_CONTEXT,
  MODEL_MIN,
  MODEL_OUTCOME,
  MODEL_STEP,
  MODEL_TABLE,
} from "./username-model";

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Usernames shorter than this are never judged random. */
export const MIN_LETTERS = 6;

/**
 * At or below this total log-likelihood ratio a name is judged random.
 * Calibrated on prod 2026-10-14: catches ~88% of the 8-letter bot wave and
 * flags 0 of 2,890 accounts with real activity except two that are
 * themselves random strings (`Uioyjd`, `hermeszjfzpi`).
 */
export const RANDOM_THRESHOLD = -5.5;

const N = MODEL_CONTEXT.length;
const M = MODEL_OUTCOME.length;

function entry(a: string, b: string, c: string): number {
  const i = (MODEL_CONTEXT.indexOf(a) * N + MODEL_CONTEXT.indexOf(b)) * M + MODEL_OUTCOME.indexOf(c);
  return ALPHABET.indexOf(MODEL_TABLE[i]) * MODEL_STEP + MODEL_MIN;
}

/**
 * Log-likelihood ratio of `word` (letters a-z) under the name model versus
 * uniformly random letters. Positive reads like language; negative like noise.
 */
export function nameLikeness(word: string): number {
  const s = "^^" + word.toLowerCase() + "$";
  let total = 0;
  for (let i = 2; i < s.length; i++) total += entry(s[i - 2], s[i - 1], s[i]);
  return total;
}

/**
 * Handle affixes that are not words to the model but are how people name
 * themselves: initials + "dev" (`tpkdev`), a framework + "js" (`nuxtjs`).
 * The rest of the handle has to be random on its own before it counts.
 */
const AFFIXES = [
  "official", "studio", "codes", "labs", "tech", "apps", "devs", "bots", "code",
  "real", "the", "its", "iam", "dev", "app", "bot", "lab", "gpt", "llm", "ops",
  "sec", "web", "net", "eth", "btc", "nft", "xyz", "js", "ts", "io", "ai", "hq",
  "tv", "gg", "ml", "ui", "ux", "mr", "ms", "dr", "im",
];

function stripAffixes(word: string): string {
  let core = word.toLowerCase();
  for (let changed = true; changed; ) {
    changed = false;
    for (const a of AFFIXES) {
      if (core.length - a.length < 3) continue;
      if (core.endsWith(a)) { core = core.slice(0, -a.length); changed = true; }
      else if (core.startsWith(a)) { core = core.slice(a.length); changed = true; }
    }
  }
  return core;
}

/** True when `username` is a run of letters that reads as random typing. */
export function looksRandomUsername(username: string): boolean {
  if (!new RegExp(`^[a-zA-Z]{${MIN_LETTERS},}$`).test(username)) return false;
  if (nameLikeness(username) > RANDOM_THRESHOLD) return false;
  const core = stripAffixes(username);
  return core.length >= MIN_LETTERS && nameLikeness(core) <= RANDOM_THRESHOLD;
}

/** The error shown when a signup or rename is refused for a random handle. */
export const RANDOM_USERNAME_MESSAGE =
  "That username looks like random letters. Please choose a handle that reads as a name or words (for example jane-doe or pixelsmith).";
