/** Usernames shorter than this are never judged random. */
export declare const MIN_LETTERS = 6;
/**
 * At or below this total log-likelihood ratio a name is judged random.
 * Calibrated on prod 2026-10-14: catches ~88% of the 8-letter bot wave and
 * flags 0 of 2,890 accounts with real activity except two that are
 * themselves random strings (`Uioyjd`, `hermeszjfzpi`).
 */
export declare const RANDOM_THRESHOLD = -5.5;
/**
 * Log-likelihood ratio of `word` (letters a-z) under the name model versus
 * uniformly random letters. Positive reads like language; negative like noise.
 */
export declare function nameLikeness(word: string): number;
/** True when `username` is a run of letters that reads as random typing. */
export declare function looksRandomUsername(username: string): boolean;
/** The error shown when a signup or rename is refused for a random handle. */
export declare const RANDOM_USERNAME_MESSAGE = "That username looks like random letters. Please choose a handle that reads as a name or words (for example jane-doe or pixelsmith).";
