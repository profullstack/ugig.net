/**
 * Two things that fill ugig's hiring board without being job openings.
 *
 * 1. Virtual-card selling ("Reloadable Virtual Credit Card For Safer Online
 *    Checkout 8AM"). One account posted 77 of these, hourly, as hiring gigs.
 *    It is a payments product pitch, not work anyone can apply to, and it is
 *    the shape carding shops advertise in. Refused outright, both listing types.
 *
 * 2. A service on offer posted as a job ("Spot-check one script for bugs — $5,
 *    6h", "I will review your code in 24h"). Mostly agents that never knew
 *    `listing_type: "for_hire"` existed. Not spam, just in the wrong place, so
 *    the answer is "post this as for_hire" with an explicit override, never a
 *    silent block: a real job post that trips it can say so and go through.
 *
 * Both scorers want several independent signals. A single word ("virtual
 * card", "I will") is never enough, because real job posts use them too
 * ("integrate virtual card issuing into our app", "I will pay on delivery").
 */

const VCC_PHRASE =
  /\b(virtual\s+(visa\s+|master\s?card\s+|credit\s+|debit\s+|payment\s+|prepaid\s+)?cards?|vccs?|reloadable\s+(virtual\s+)?(visa\s+|credit\s+|debit\s+|prepaid\s+)?cards?)\b/gi;

/** Selling a card, as opposed to building something that issues one. */
const VCC_SALES_CUES = [
  /\b(google|meta|facebook|tiktok|bing)\s+ads?\b/i,
  /\bad(vertising)?\s+(spend|accounts?|platforms?|budgets?)\b/i,
  /\b(card[\s-]on[\s-]file|auto[\s-]?renewals?|recurring\s+(payments|billing|software))\b/i,
  /\b(spend\s+control|safer\s+(online\s+)?(checkout|payments?|purchas))/i,
  /\b(get|buy|order)\s+(a|your)\s+(reloadable\s+)?(virtual|vcc)/i,
  /\bour\s+(remote\s+)?(virtual|payment|vcc)\b/i,
  /\bmarketers?(,|\s+and)\s+(agencies|freelancers)\b/i,
  /\b(primary|main)\s+bank\s+card\b|\b(marketing|campaign)\s+(spend|expenses)\b/i,
];

/** Engineering work on cards, which is a legitimate job. */
const VCC_BUILD_CUES =
  /\b(api|sdk|integrat\w*|implement\w*|develop\w*|build\s+(a|an|our|the)|issuing\s+platform|marqeta|lithic|stripe\s+issuing)\b/i;

export interface ListingCheck {
  /** 0..1, higher = more confident. */
  score: number;
  reasons: string[];
}

export function virtualCardSpamCheck(title: string, description: string): ListingCheck {
  const text = `${title}\n${description}`;
  const reasons: string[] = [];
  const titleHits = (title.match(VCC_PHRASE) || []).length;
  const allHits = (text.match(VCC_PHRASE) || []).length;
  if (allHits === 0) return { score: 0, reasons };

  let score = 0;
  if (titleHits > 0) {
    score += 0.4;
    reasons.push("virtual card in title");
  }
  if (allHits >= 3) {
    score += 0.2;
    reasons.push("virtual card repeated");
  }
  const cues = VCC_SALES_CUES.filter((re) => re.test(text)).length;
  score += Math.min(cues, 3) * 0.15;
  if (cues > 0) reasons.push(`${cues} card-sales cue(s)`);
  // The flood titles end in a rotating "8AM" / "29AM" counter to dodge dedupe.
  if (/\b\d{1,2}\s?AM\s*$/i.test(title.trim())) {
    score += 0.2;
    reasons.push("hour-counter title suffix");
  }
  if (VCC_BUILD_CUES.test(text)) {
    score -= 0.5;
    reasons.push("reads as engineering work");
  }
  return { score: clamp(score), reasons };
}

export const VIRTUAL_CARD_SPAM_THRESHOLD = 0.7;

/** Offer language: the poster describing what *they* deliver. */
const OFFER_TITLE = [
  { re: /^\s*(i\s+will|i'll|i\s+can|we\s+will|i\s+offer|we\s+offer|i\s+provide|we\s+provide)\b(?!\s+(pay|hire|give|reward|tip|send\s+you|be\s+paying))/i, w: 0.6, why: "title opens with an offer" },
  // "— $5, 6h", "$0.05/min, 24-48h", "$20+ Fast Delivery"
  { re: /\$\s?\d+(\.\d+)?(\s*-\s*\d+(\.\d+)?)?\s*(\+|\/\s?(min|post|page|word|hr|hour|message))?\s*,?\s*(\d+(-\d+)?\s?(h|hrs?|hours?|min|mins|days?)\b|fast\s+delivery)/i, w: 0.6, why: "price and turnaround in title" },
  { re: /\(\s*\$\s?\d+(\.\d+)?\s*\)\s*$|[—–-]\s*\$\s?\d+(\.\d+)?(\s*(fixed|usd|sol|usdc))?\s*$/i, w: 0.35, why: "title ends in its own price" },
  { re: /\b\d+(-\d+)?\s?(h|hrs?|hours?|min|minutes?)\s+delivery\b|\bdelivered\s+in\s+(hours|\d+\s?(h|hours?))\b|\(\s*\d+\s?(min|h)(\s+delivery)?\s*\)|[—–-]\s*\d+\s?(h|min)\s*$|\b24\/7\s+agent\b|\bagent[\s-]delivered\b|\bfast\s+delivery\b/i, w: 0.35, why: "delivery time promised" },
  { re: /\b(tested|receipted|documented)\s*(,|and|&)\s*(tested|receipted|documented|delivered)\b|\bwith\s+(receipts|proof)\b/i, w: 0.25, why: "deliverable boasting" },
];

const OFFER_BODY = [
  { re: /\b(i|we)\s+(will\s+|'ll\s+|can\s+)?(build|deliver|design|migrate|set\s+up|automate|research|review|fix|write|create|audit|produce|turn|parse|clean|convert|specialize|answer)\b/i, w: 0.35, why: "body describes what the poster delivers" },
  { re: /\b(send\s+(me|us|one|a|your)|you\s+send|ask\s+(me\s+)?one|share\s+your)\b/i, w: 0.3, why: "body asks the reader to send work" },
  { re: /\b(for[\s-]hire\s+service|service\s+offer|turnaround|launch\s+price|free\s+sample|zero[\s-]risk|revisions?\s+included|commercial\s+rights\s+included|powered\s+by\s+[\w\s]{0,20}agent|order\s+now|hire\s+me|my\s+(services?|rate|portfolio)|services:|what\s+(you\s+get|i\s+(set\s+up|deliver|build))|what\s+gets\s+\w+|(\d+|one)[\s-](hour|day)\s+delivery)\b/i, w: 0.3, why: "sales copy" },
];

/** A poster asking for someone. Questions are dropped first: "Need a site?" is a pitch. */
const HIRING_CUES =
  /\b((i|we)('ll|\s+will)\s+(pay|hire|reward|tip)\b|pay\s+you\b|paying\s+(you|for)\b|per\s+(feature|bug|fix|submission|review)\b|we\s*('re|\s+are)\s+(hiring|looking)|i('m|\s+am)\s+looking\s+for|looking\s+for\s+(a|an|someone|somebody|developers?|engineers?|designers?|freelancers?|agents?|people|help)\b|(i|we)\s+need\b|(is|are)\s+needed\b|needed\s+(for|to|asap|urgently)\b|\bseeking\b|\bwanted\b|\bhiring\b|your\s+role\b|you\s+will\s+(build|be|work|create|help|need)|you'll\s+(be|work|build)\b|responsibilit(y|ies)|requirements?:|must\s+(have|be)\b|applicants?|candidates?|budget\s+is|users\s+should\s+be\s+able|i\s+have\s+(an?|existing|some|a\s+few)\b|our\s+(company|startup|app|website|product|platform|business)\b)/i;
const HIRING_TITLE = /^\s*(need(ed)?|looking\s+for|hiring|seeking|wanted)\b|\bneeded\b/i;

function withoutQuestions(text: string): string {
  return text.replace(/[^.!?\n]*\?/g, " ");
}

export function forHireAsHiringCheck(title: string, description: string): ListingCheck {
  const reasons: string[] = [];
  let score = 0;
  for (const s of OFFER_TITLE) {
    if (s.re.test(title)) {
      score += s.w;
      reasons.push(s.why);
    }
  }
  for (const s of OFFER_BODY) {
    if (s.re.test(description)) {
      score += s.w;
      reasons.push(s.why);
    }
  }
  if (HIRING_TITLE.test(withoutQuestions(title)) || HIRING_CUES.test(withoutQuestions(`${title}\n${description}`))) {
    score -= 0.6;
    reasons.push("asks for someone (hiring language)");
  }
  return { score: clamp(score), reasons };
}

export const FOR_HIRE_AS_HIRING_THRESHOLD = 0.6;

export type ListingVerdict =
  | { ok: true }
  | { ok: false; code: "virtual_card_spam"; status: 400; error: string; reasons: string[] }
  | {
      ok: false;
      code: "looks_like_for_hire";
      status: 422;
      error: string;
      reasons: string[];
      suggested_listing_type: "for_hire";
    };

/**
 * Decide whether a gig may be posted as given. `confirmHiring` is the poster
 * saying "this really is a job opening", which clears the for-hire check only.
 */
export function checkGigListing(input: {
  title: string;
  description: string;
  listingType: "hiring" | "for_hire";
  confirmHiring?: boolean;
}): ListingVerdict {
  const title = input.title || "";
  const description = input.description || "";

  const vcc = virtualCardSpamCheck(title, description);
  if (vcc.score >= VIRTUAL_CARD_SPAM_THRESHOLD) {
    return {
      ok: false,
      code: "virtual_card_spam",
      status: 400,
      error: "ugig doesn't allow listings that sell virtual or reloadable payment cards.",
      reasons: vcc.reasons,
    };
  }

  if (input.listingType === "hiring" && !input.confirmHiring) {
    const offer = forHireAsHiringCheck(title, description);
    if (offer.score >= FOR_HIRE_AS_HIRING_THRESHOLD) {
      return {
        ok: false,
        code: "looks_like_for_hire",
        status: 422,
        error:
          'This reads like a service you offer, not a job you are hiring for. Post it with "listing_type": "for_hire" ' +
          'so it shows under services and buyers can use Buy now. If it really is a job opening, resend with "confirm_hiring": true.',
        reasons: offer.reasons,
        suggested_listing_type: "for_hire",
      };
    }
  }

  return { ok: true };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

/** The JSON body for a refused listing. */
export function listingRefusalBody(verdict: Exclude<ListingVerdict, { ok: true }>) {
  const { ok: _ok, status: _status, ...body } = verdict;
  return body;
}
