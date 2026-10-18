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
  { re: /\b(tested|receipted|documented)\s*(,|and|&)\s*(tested|receipted|documented|delivered)\b|\bwith\s+(receipts|proof)\b|\b(source[\s-]cited|decision[\s-]ready|severity[\s-]rated|evidence[\s-]based|verified\s+sources)\b/i, w: 0.25, why: "deliverable boasting" },
  // 2026-10-18: "— 12h, $12", "Research Brief in 48 Hours", "48-hour ... sprint", ", 24h delivery"
  { re: /(^|[\s,(—–-])\d+(-\d+)?\s?(h|hrs?)\s*(,|\)|$)|\bin\s+\d+\s+hours\b|^\s*\d+-hour\b/i, w: 0.35, why: "turnaround in title" },
  // A rate card: "$0.05/min", "$0.05 SOL per post", "$10 fixed"
  { re: /\$\s?\d+(\.\d+)?\s*(usd|usdc|sol)?\s*(\/\s?|per\s+)(min|minute|post|page|word|article|brief|report|file|call)\b|\$\s?\d+(\.\d+)?\s+fixed\b|,\s*\$\s?\d+(\.\d+)?\s*$/i, w: 0.35, why: "rate card in title" },
  // 2026-10-18 (mira): catalog titles. "— Keep Your Agent Working While You Sleep", "— Replace Your Slow Spreadsheets"
  { re: /[—–]\s*([\w'/-]+\s+){0,4}(your|you)\b|\bwhile\s+you\s+(sleep|focus|work|rest)\b|\bwhat\s+your\s+(company|site|brand|business)\b/i, w: 0.35, why: "pitch tagline addressed to the buyer" },
  { re: /\b(ai\s+)?agent\s+services?\b|\bservices?\s*:/i, w: 0.4, why: "service list in title" },
  { re: /\brefer\s+clients\b|\bregister\s+on\s+[\w.-]+\.[a-z]{2,}\b|\bget\s+discovered\b|\bmarketplace\s+listing\b/i, w: 0.6, why: "platform promo in title" },
  // "Name — tagline": the em dash is how agent catalogs title a product. Weak alone.
  { re: /\S\s+—\s+\S/, w: 0.3, why: "catalog-style title" },
  { re: /\bwith\s+(tests|patched\s+snippets|receipts)\b|\bcompliant\s*\+\s*tested\b|\+\s*(eval[\s-]set|validation)\b|^\s*tested\b|^\s*(severity[\s-]rated|source[\s-]cited)\b/i, w: 0.3, why: "deliverable boasting" },
];

const OFFER_BODY = [
  { re: /\b(i|we)(\s+will|'ll|\s+can)?\s+(build|deliver|design|migrate|set\s+up|automate|research|review|fix|write|create|audit|produce|turn|parse|clean|convert|specialize|answer|perform|generate|analy[sz]e|extract|run|crawl|evaluate|handle|integrate|keep|manage|monitor|ship|offer|operate|security-audit)\b/i, w: 0.35, why: "body describes what the poster delivers" },
  // 2026-10-18 (mira): agents saying outright that the post is their service.
  { re: /\bautonomous\s+(ai\s+)?(agent\s+)?service\b|\bfor[\s-]hire\s+service\b|\bservice\s+offer\b|\bi\s+am\s+an?\s+(autonomous\s+)?ai\s+agent\b|\b(professional\s+)?ai\s+agent\s+services\b|\bservice\s+by\s+[A-Z]\w+|^\s*ai(-powered)?\s+(agent\s+)?(that|diagnostic)\b/im, w: 0.6, why: "body says this is a service on offer" },
  { re: /^\W*(what\s+i\s+(do|build|integrate|deliver|need(\s+from\s+you)?)|my\s+solution|topics\s+i\s+specialize\s+in|who\s+this\s+is\s+(not\s+)?for|format\s+options|what\s+gets\s+\w+|what\s+a\s+\w+\s+includes|tiers?\s*:|buyers\s*:|capabilities\s*:|services(\s+included)?\s*:)/im, w: 0.3, why: "service-page headings" },
  { re: /\b(usdc|sol)(\s*\/\s*sol)?\s+(preferred|accepted)\b|\bpay\s+in\s+usdc\b|\bfixed\s+(scope|price)\s+per\s+(task|repository|repo|project)\b|\bpayment\s+on\s+delivery\b|\b\d+h\s+turnaround\b|\bdelivery\s*:\s*\d+|\bbounded\s+(build|audit|task)\b|\bbest\s+(for|fits?)\s*:|\blivrable\s*:/i, w: 0.3, why: "seller's own terms" },
  { re: /^\s*(i|we)(\s+will|'ll|\s+can)\s+(?!pay|hire|give|reward|tip|need|be\s+paying)|^\W*(your\s+(?!role|task|job|work|mission)\w+|(promote|stress-test|stop|grow|boost|scale)\s+your)\b/i, w: 0.3, why: "body opens with a pitch" },
  { re: /\bkarma\s+\d+|\b\d+\+?\s+(posts|articles|molts|followers)\b|\bcves?\s+found\b|\bpublic\s+proof\s+repo\b|\boperate\s+24\/7\b|\bdeliver\s+fast\b|\b\d\+?\s+years\s+of\s+experience\b|\bavailable\s+immediately\b|\b(register|list\s+your\s+(ai\s+)?agent)\b[^.\n]{0,40}\b(here|on\s+[\w.-]+\.[a-z]{2,})\b|\bearn\s+\d+%\s+commission\b|\bfounding\s+(agents?|slots)\b|(^|[.!]\s+)(built|shipped|deployed\s+on)\s+[\w-]+/im, w: 0.3, why: "seller credentials or platform promo" },
  // Telling a buyer what arrives: "you get clean, validated data", "Deliverables:", "Delivery within 24 hours".
  // "you get paid" / "you will receive $5" is a job paying someone, so money is excluded.
  { re: /\byou(\s+will|'ll)?\s+(get|receive)\s+(?!paid|\$|\d|payment|usd|sol|sats|bitcoin|a\s+(bonus|tip|reward))|\bwhat'?s\s+included\b|\bdelivered\s+(as|within)\b|\bdelivery\s*(:|within)|\b\d+(-\d+)?\s?(h|hours?)\s+(turnaround|delivery)\b|\bfixed\s+price\s+per\b|\b(i\s+cover|specialties|services\s+included)\s*:|\bideal\s+for\b/i, w: 0.3, why: "body tells the buyer what they get" },
  { re: /\b(send\s+(me|us|one|a|your)|you\s+send|ask\s+(me\s+)?one|share\s+your)\b/i, w: 0.3, why: "body asks the reader to send work" },
  { re: /\b(for[\s-]hire\s+service|service\s+offer|turnaround|launch\s+price|free\s+sample|zero[\s-]risk|revisions?\s+included|commercial\s+rights\s+included|powered\s+by\s+[\w\s]{0,20}agent|order\s+now|hire\s+me|my\s+(services?|rate|portfolio)|services:|what\s+(you\s+get|i\s+(set\s+up|deliver|build))|what\s+gets\s+\w+|(\d+|one)[\s-](hour|day)\s+delivery)\b/i, w: 0.3, why: "sales copy" },
];

/** A poster asking for someone. Questions are dropped first: "Need a site?" is a pitch. */
const HIRING_CUES =
  /\b((i|we)('ll|\s+will)\s+(pay|hire|reward|tip)\b|pay\s+you\b|paying\s+(you|for)\b|per\s+(feature|bug|fix|submission|review)\b|we\s*('re|\s+are)\s+(hiring|looking)|i('m|\s+am)\s+looking\s+for|(^|[.!\n:]\s*|(we|i)('re|'m|\s+are|\s+am)\s+)looking\s+for\s+(a|an|someone|somebody|developers?|engineers?|designers?|freelancers?|agents?|people|help)\b|(?<!\bwhat\s)(i|we)\s+need\b(?!\s+from\s+you)|(is|are)\s+needed\b|needed\s+(for|to|asap|urgently)\b|\bseeking\b|\bwanted\b|\bopen\s+bount(y|ies)\b|\bfirst\s+(working\s+)?(pr|submission)\s+(gets|wins)\b|\b(we('re|\s+are)|i('m|\s+am)|now|currently)\s+hiring\b|(^|[.!\n]\s*)hiring\b|\bhiring\s+(ai\s+)?(a|an|agents?|humans?|developers?|engineers?|designers?|writers?|freelancers?|people|someone)\b|your\s+role\b|you\s+will\s+(build|be|work|create|help|need)|you'll\s+(be|work|build)\b|responsibilit(y|ies)|requirements?:|(^|[.!\n•-]\s*|you\s+)must\s+(have|be)\b|applicants?|\bcandidates?\s+(should|must|will|who|with)\b|\bideal\s+candidate|budget\s+is|users\s+should\s+be\s+able|i\s+have\s+(an?|existing|some|a\s+few)\b|our\s+(company|startup|app|website|product|platform|business)\b|(^|[.!\n]\s*)need\s+(an?|someone|somebody|help|people)\b)/im;
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
  const asks =
    withoutQuestions(title).match(HIRING_TITLE) || withoutQuestions(`${title}\n${description}`).match(HIRING_CUES);
  if (asks) {
    score -= 0.6;
    reasons.push(`asks for someone (hiring language: "${asks[0].trim()}")`);
  }
  return { score: clamp(score), reasons };
}

export const FOR_HIRE_AS_HIRING_THRESHOLD = 0.6;

/**
 * 3. Account rental (2026-10-18): "I'm looking for U.S. resident who can work
 *    with me ... provide AI platform accounts and get salary monthly". The job
 *    is lending your identity and your accounts to someone abroad, which is how
 *    platform bans and fraud get laundered. Needs both halves: a residency or
 *    citizenship requirement AND handing over accounts or ID. A US-only job
 *    alone, or "set up accounts for our team", is not this.
 */
const RESIDENCY_CUE =
  /\b(u\.?s\.?a?\.?|united\s+states|american|uk|canad(a|ian)|eu)\s+(residents?|citizens?|nationals?|persons?|people)\b|\b(residents?|citizens?)\s+of\s+(the\s+)?(u\.?s\.?a?|united\s+states|uk|canada)\b/i;
const ACCOUNT_HANDOVER_CUE =
  /\b(provide|lend|rent|share|give|sell|use)\s+(us\s+|me\s+)?(your\s+)?(own\s+)?([\w.-]+\s+){0,3}(accounts?|identity|id\s+documents?|ssn|bank\s+details)\b|\baccount\s+(rental|renting|holder\s+needed)\b|\b(rent|use)\s+your\s+(identity|account)\b/i;

export function accountRentalCheck(title: string, description: string): ListingCheck {
  const text = `${title}\n${description}`;
  const reasons: string[] = [];
  if (RESIDENCY_CUE.test(text)) reasons.push("residency or citizenship requirement");
  if (ACCOUNT_HANDOVER_CUE.test(text)) reasons.push("asks the worker to hand over accounts or identity");
  return { score: reasons.length === 2 ? 1 : 0, reasons };
}

export type ListingVerdict =
  | { ok: true }
  | { ok: false; code: "virtual_card_spam"; status: 400; error: string; reasons: string[] }
  | { ok: false; code: "account_rental"; status: 400; error: string; reasons: string[] }
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

  const rental = accountRentalCheck(title, description);
  if (rental.score >= 1) {
    return {
      ok: false,
      code: "account_rental",
      status: 400,
      error:
        "ugig doesn't allow listings that recruit people to provide or lend their accounts or identity based on where they live.",
      reasons: rental.reasons,
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
