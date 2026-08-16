/**
 * Lightweight spam/bot detection for usernames and names.
 * Returns { spam: boolean, reason?: string }
 */

// Common spam patterns
const SPAM_USERNAME_PATTERNS = [
  /^[a-z]{2,4}\d{5,}$/i,          // ab12345, xyz99999
  /^user\d{4,}$/i,                  // user12345
  /^[a-z]+_[a-z]+\d{3,}$/i,        // first_last123
  /\d{8,}/,                          // 8+ consecutive digits
  /^[a-z0-9]{20,}$/,                // 20+ random alphanumeric
  /(.)\1{4,}/,                       // 5+ repeated chars: aaaaa
  /^(buy|sell|cheap|free|promo|discount|crypto|nft|airdrop|casino|poker|viagra|cialis)/i,
  /(seo|marketing|agency|boost|traffic|followers|likes)\d*$/i,
];

const SPAM_NAME_PATTERNS = [
  /^[A-Z][a-z]+ [A-Z][a-z]+\d+$/,  // "John Smith123"
  /(.)\1{3,}/,                       // 4+ repeated chars
  /\d{4,}/,                          // 4+ digits in name
  /^[^a-zA-Z\s\-'.]+$/,             // no letters at all
  /(http|www\.|\.com|\.net|\.org)/i, // URLs in name
  /^(admin|moderator|support|helpdesk|official)/i,
  /[^\x00-\x7F]{10,}/,              // 10+ non-ASCII (excessive unicode)
];

// Keyboard-mash detection: check consonant clusters
function isKeyboardMash(str: string): boolean {
  const lower = str.toLowerCase().replace(/[^a-z]/g, "");
  if (lower.length < 6) return false;
  // Count vowels
  const vowels = lower.replace(/[^aeiou]/g, "").length;
  const ratio = vowels / lower.length;
  // Normal English ~38% vowels; below 10% is suspicious
  return ratio < 0.1 && lower.length > 8;
}

// Entropy check: random strings have high entropy
function shannonEntropy(str: string): number {
  const freq: Record<string, number> = {};
  for (const c of str) freq[c] = (freq[c] || 0) + 1;
  const len = str.length;
  return -Object.values(freq).reduce((sum, f) => {
    const p = f / len;
    return sum + p * Math.log2(p);
  }, 0);
}

// Corroborating randomness signals for the entropy check. Each is deliberately
// weaker than the standalone patterns above and is never used on its own -- they
// only gate the entropy branch. Generated strings are unbroken tokens that are
// consonant-heavy, randomly cased, or carry capital runs; names a human picked use
// separators or read as words.
function looksGenerated(str: string): boolean {
  const hasSeparator = /[_.\-]/.test(str);
  const lower = str.toLowerCase();
  const letters = lower.replace(/[^a-z]/g, "");
  const vowelRatio = letters.length
    ? letters.replace(/[^aeiou]/g, "").length / letters.length
    : 1;

  // Case flips between adjacent letters: random generators flip constantly,
  // CamelCase flips once per word.
  let caseSwitches = 0;
  for (let i = 1; i < str.length; i++) {
    const prev = str[i - 1];
    const curr = str[i];
    if (
      /[a-zA-Z]/.test(prev) &&
      /[a-zA-Z]/.test(curr) &&
      (prev === prev.toUpperCase()) !== (curr === curr.toUpperCase())
    ) {
      caseSwitches++;
    }
  }
  const caseSwitchRatio = caseSwitches / str.length;

  const longestRun = (s: string, re: RegExp) =>
    (s.match(re) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  // Run over the full string so separators and digits break clusters, matching
  // check_username_spam() in SQL. 'y' is excluded as a semivowel: counting it turns
  // readable compounds into false clusters ("watchingmyhuman" -> "ngmyh").
  const maxConsonantRun = longestRun(lower, /[bcdfghjklmnpqrstvwxz]+/g);
  const maxUpperRun = longestRun(str, /[A-Z]+/g);

  return (
    (!hasSeparator && caseSwitchRatio > 0.25) ||
    (!hasSeparator && vowelRatio < 0.25) ||
    // 6 rather than 5 because real compounds reach 5 ("northstar" -> "rthst").
    maxConsonantRun >= 6 ||
    (!hasSeparator && /[a-z]/.test(str) && maxUpperRun >= 3)
  );
}

export function checkSpam(
  username: string,
  fullName?: string | null
): { spam: boolean; reason?: string } {
  // Username checks
  for (const pattern of SPAM_USERNAME_PATTERNS) {
    if (pattern.test(username)) {
      return { spam: true, reason: "Username matches spam pattern" };
    }
  }

  if (isKeyboardMash(username)) {
    return { spam: true, reason: "Username appears to be random characters" };
  }

  // High entropy on its own is not evidence of a bot: entropy grows with length and
  // character diversity, so a long descriptive name scores as high as a generated
  // one. Require a corroborating randomness signal. Thresholds match
  // check_username_spam() in SQL, which is what actually sets profiles.is_spam.
  if (
    username.length > 10 &&
    shannonEntropy(username) > 3.8 &&
    looksGenerated(username)
  ) {
    return { spam: true, reason: "Username appears randomly generated" };
  }

  // Name checks
  if (fullName) {
    for (const pattern of SPAM_NAME_PATTERNS) {
      if (pattern.test(fullName)) {
        return { spam: true, reason: "Name matches spam pattern" };
      }
    }

    if (isKeyboardMash(fullName.replace(/\s/g, ""))) {
      return { spam: true, reason: "Name appears to be random characters" };
    }
  }

  return { spam: false };
}

// Common disposable/throwaway email domains
const DISPOSABLE_DOMAINS = new Set([
  "tempmail.com", "throwaway.email", "guerrillamail.com", "guerrillamail.net",
  "mailinator.com", "yopmail.com", "sharklasers.com", "guerrillamailblock.com",
  "grr.la", "dispostable.com", "mailnesia.com", "maildrop.cc", "discard.email",
  "tempail.com", "tempr.email", "temp-mail.org", "fakeinbox.com", "trashmail.com",
  "trashmail.net", "trashmail.me", "mohmal.com", "getnada.com", "emailondeck.com",
  "10minutemail.com", "minutemail.com", "tempinbox.com", "binkmail.com",
  "mailcatch.com", "mailexpire.com", "mailmoat.com", "mailnull.com",
  "mytrashmail.com", "spamfree24.org", "spamgourmet.com", "spamhereplease.com",
  "throwam.com", "trash-mail.at", "trashymail.com", "yopmail.fr", "yopmail.net",
  "jetable.org", "guerrillamail.info", "guerrillamail.biz", "guerrillamail.de",
  "guerrillamail.org", "harakirimail.com", "mailforspam.com",
]);

const SPAM_EMAIL_PATTERNS = [
  /^[a-z]{2,3}\d{6,}@/i,           // ab123456@...
  /^[a-z0-9]{20,}@/i,               // long random local part
  /\+.{10,}@/,                       // long plus-addressing (used for mass signups)
];

export function checkEmail(email: string): { spam: boolean; reason?: string } {
  const [localPart, domain] = email.toLowerCase().split("@");
  if (!localPart || !domain) return { spam: true, reason: "Invalid email" };

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { spam: true, reason: "Disposable email addresses are not allowed" };
  }

  for (const pattern of SPAM_EMAIL_PATTERNS) {
    if (pattern.test(email)) {
      return { spam: true, reason: "Email matches spam pattern" };
    }
  }

  return { spam: false };
}
