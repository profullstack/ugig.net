/**
 * ugig.net daily stats report: counts + the email built from them.
 *
 * Used by the cron route (/api/cron/daily-stats, runs inside the app so it
 * always reads the same database the site does) and by
 * scripts/daily-stats-email.ts for a manual run.
 *
 * Every query failure THROWS. The report used to log a warning and carry on
 * with 0, so when the Supabase cloud project it pointed at went away
 * (2026-09-25, the move to dev2) it mailed "0 users, 0 gigs, 0 msgs" every
 * morning instead of failing. A report with a hole in it is worse than no
 * report: nothing gets sent unless every number was actually read.
 */

import { HIRED_APPLICATION_STATUSES } from "@/lib/application-status";

type Client = { from: (table: string) => any };
type Filter = Record<string, string | boolean | null | readonly string[]>;

export class DailyStatsQueryError extends Error {
  constructor(what: string, message: string) {
    super(`daily stats: ${what} failed: ${message}`);
    this.name = "DailyStatsQueryError";
  }
}

export interface DailyStats {
  date: string;
  users: { total: number; new24h: number; new7d: number; new30d: number; spamFlagged: number };
  recentUsers: { username: string | null; full_name: string | null; created_at: string | null }[];
  gigs: {
    total: number;
    active: number;
    filled: number;
    closed: number;
    draft: number;
    /** Active gigs that are jobs (listing_type=hiring). The rest of "active" are for-hire ads. */
    activeHiring: number;
    /** Active for-hire ads ("I will ... for $X"); these can never be "filled". */
    activeForHire: number;
    new24h: number;
    new7d: number;
    new30d: number;
  };
  recentGigs: { title: string | null; status: string | null; created_at: string | null }[];
  applications: {
    total: number;
    pending: number;
    accepted: number;
    /** accepted + in_progress + completed + paid */
    hired: number;
    rejected: number;
    new24h: number;
    new7d: number;
  };
  posts: { total: number; new24h: number; new7d: number; comments: number; newComments24h: number };
  social: { follows: number; newFollows24h: number; endorsements: number; reviews: number; newReviews24h: number };
  messaging: { conversations: number; newConversations24h: number; messages: number; newMessages24h: number };
  /** gig_invoices: worker -> poster invoices paid through CoinPay. This is where gig money moves. */
  invoices: {
    total: number;
    paid: number;
    awaitingPayment: number;
    new24h: number;
    paid24h: number;
    /**
     * Created in the last 24h with no coinpay_invoice_id yet. The id is minted
     * when the poster presses Pay, so this is "not yet put up for payment",
     * not by itself an error; a count that never drains is the 2026-09 stall.
     */
    noCoinpayId24h: number;
    /**
     * Created in the last 24h with no receiving wallet: nothing the poster can
     * pay. Should always be 0 now that creation is gated; non-zero is a bug.
     */
    unpayable24h: number;
  };
  /** payments: Pro/lifetime/funding/tip checkouts only, not gig payments. */
  payments: { total: number; confirmed: number; forwarded: number; pending: number; new24h: number };
}

function errMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function applyFilter(q: any, filter?: Filter) {
  if (filter) {
    for (const [col, val] of Object.entries(filter)) {
      if (val === null) q = q.is(col, null);
      else if (Array.isArray(val)) q = q.in(col, val);
      else q = q.eq(col, val);
    }
  }
  return q;
}

async function count(supabase: Client, table: string, filter?: Filter): Promise<number> {
  const q = applyFilter(supabase.from(table).select("*", { count: "exact", head: true }), filter);
  const { count: c, error } = await q;
  if (error) throw new DailyStatsQueryError(`count(${table})`, errMessage(error));
  if (typeof c !== "number") throw new DailyStatsQueryError(`count(${table})`, "no count returned");
  return c;
}

async function countSince(
  supabase: Client,
  table: string,
  col: string,
  hours: number,
  filter?: Filter
): Promise<number> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { count: c, error } = await applyFilter(
    supabase.from(table).select("*", { count: "exact", head: true }),
    filter
  ).gte(col, since);
  if (error) throw new DailyStatsQueryError(`countSince(${table}, ${hours}h)`, errMessage(error));
  if (typeof c !== "number") throw new DailyStatsQueryError(`countSince(${table}, ${hours}h)`, "no count returned");
  return c;
}

async function recent<T>(supabase: Client, table: string, columns: string, limit: number): Promise<T[]> {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new DailyStatsQueryError(`recent(${table})`, errMessage(error));
  return (data ?? []) as T[];
}

export async function collectDailyStats(supabase: Client, now: Date = new Date()): Promise<DailyStats> {
  const day = 24;
  const [
    usersTotal, users24h, users7d, users30d, usersSpam, recentUsers,
    gigsTotal, gigsActive, gigsFilled, gigsClosed, gigsDraft, gigsActiveHiring, gigsActiveForHire,
    gigs24h, gigs7d, gigs30d, recentGigs,
    appsTotal, appsPending, appsAccepted, appsHired, appsRejected, apps24h, apps7d,
    postsTotal, posts24h, posts7d, commentsTotal, comments24h,
    follows, follows24h, endorsements, reviews, reviews24h,
    convos, convos24h, messages, messages24h,
    invTotal, invPaid, invSent, inv24h, invPaid24h, invNoId24h, invUnpayable24h,
    payTotal, payConfirmed, payForwarded, payPending, pay24h,
  ] = await Promise.all([
    count(supabase, "profiles"),
    countSince(supabase, "profiles", "created_at", day),
    countSince(supabase, "profiles", "created_at", 7 * day),
    countSince(supabase, "profiles", "created_at", 30 * day),
    count(supabase, "profiles", { is_spam: true }),
    recent<DailyStats["recentUsers"][number]>(supabase, "profiles", "username, full_name, created_at", 5),
    // gig_status: draft | active | paused | closed | filled
    count(supabase, "gigs"),
    count(supabase, "gigs", { status: "active" }),
    count(supabase, "gigs", { status: "filled" }),
    count(supabase, "gigs", { status: "closed" }),
    count(supabase, "gigs", { status: "draft" }),
    count(supabase, "gigs", { status: "active", listing_type: "hiring" }),
    count(supabase, "gigs", { status: "active", listing_type: "for_hire" }),
    countSince(supabase, "gigs", "created_at", day),
    countSince(supabase, "gigs", "created_at", 7 * day),
    countSince(supabase, "gigs", "created_at", 30 * day),
    recent<DailyStats["recentGigs"][number]>(supabase, "gigs", "title, status, created_at", 5),
    count(supabase, "applications"),
    count(supabase, "applications", { status: "pending" }),
    count(supabase, "applications", { status: "accepted" }),
    count(supabase, "applications", { status: HIRED_APPLICATION_STATUSES }),
    count(supabase, "applications", { status: "rejected" }),
    countSince(supabase, "applications", "created_at", day),
    countSince(supabase, "applications", "created_at", 7 * day),
    count(supabase, "posts"),
    countSince(supabase, "posts", "created_at", day),
    countSince(supabase, "posts", "created_at", 7 * day),
    count(supabase, "post_comments"),
    countSince(supabase, "post_comments", "created_at", day),
    count(supabase, "follows"),
    countSince(supabase, "follows", "created_at", day),
    count(supabase, "endorsements"),
    count(supabase, "reviews"),
    countSince(supabase, "reviews", "created_at", day),
    count(supabase, "conversations"),
    countSince(supabase, "conversations", "created_at", day),
    count(supabase, "messages"),
    countSince(supabase, "messages", "created_at", day),
    // gig_invoices.status: draft | sent | paid | cancelled | expired | rejected
    count(supabase, "gig_invoices"),
    count(supabase, "gig_invoices", { status: "paid" }),
    count(supabase, "gig_invoices", { status: "sent" }),
    countSince(supabase, "gig_invoices", "created_at", day),
    countSince(supabase, "gig_invoices", "updated_at", day, { status: "paid" }),
    countSince(supabase, "gig_invoices", "created_at", day, { coinpay_invoice_id: null }),
    countSince(supabase, "gig_invoices", "created_at", day, {
      "metadata->>merchant_wallet_address": null,
    }),
    // payment_status: pending | confirmed | forwarded | expired | failed
    count(supabase, "payments"),
    count(supabase, "payments", { status: "confirmed" }),
    count(supabase, "payments", { status: "forwarded" }),
    count(supabase, "payments", { status: "pending" }),
    countSince(supabase, "payments", "created_at", day),
  ]);

  const stats: DailyStats = {
    date: now.toISOString().split("T")[0],
    users: { total: usersTotal, new24h: users24h, new7d: users7d, new30d: users30d, spamFlagged: usersSpam },
    recentUsers,
    gigs: {
      total: gigsTotal,
      active: gigsActive,
      filled: gigsFilled,
      closed: gigsClosed,
      draft: gigsDraft,
      activeHiring: gigsActiveHiring,
      activeForHire: gigsActiveForHire,
      new24h: gigs24h,
      new7d: gigs7d,
      new30d: gigs30d,
    },
    recentGigs,
    applications: {
      total: appsTotal,
      pending: appsPending,
      accepted: appsAccepted,
      hired: appsHired,
      rejected: appsRejected,
      new24h: apps24h,
      new7d: apps7d,
    },
    posts: { total: postsTotal, new24h: posts24h, new7d: posts7d, comments: commentsTotal, newComments24h: comments24h },
    social: { follows, newFollows24h: follows24h, endorsements, reviews, newReviews24h: reviews24h },
    messaging: { conversations: convos, newConversations24h: convos24h, messages, newMessages24h: messages24h },
    invoices: {
      total: invTotal,
      paid: invPaid,
      awaitingPayment: invSent,
      new24h: inv24h,
      paid24h: invPaid24h,
      noCoinpayId24h: invNoId24h,
      unpayable24h: invUnpayable24h,
    },
    payments: { total: payTotal, confirmed: payConfirmed, forwarded: payForwarded, pending: payPending, new24h: pay24h },
  };

  // ugig has had users since launch. Zero means the report is reading the
  // wrong database (an empty one, or one whose rows RLS hides), not a quiet day.
  if (stats.users.total === 0) {
    throw new DailyStatsQueryError(
      "count(profiles)",
      "returned 0; the report is not reading the production database (check NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
    );
  }

  return stats;
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderDailyStats(s: DailyStats): { subject: string; html: string; text: string } {
  const { users, gigs, applications: apps, posts, social, messaging, invoices, payments } = s;

  const text = `
ugig.net Daily Report — ${s.date}
${"=".repeat(50)}

USERS
  Total: ${users.total}
  New (24h): ${users.new24h}
  New (7d): ${users.new7d}
  New (30d): ${users.new30d}
  Spam-flagged (all time): ${users.spamFlagged}

RECENT SIGNUPS
${s.recentUsers.map((u) => `  • ${u.full_name || u.username || "(no name)"} @${u.username} (${u.created_at?.slice(0, 10)})`).join("\n") || "  (none)"}

GIGS
  Total: ${gigs.total}
  Active: ${gigs.active} (${gigs.activeHiring} jobs, ${gigs.activeForHire} for-hire ads)
  Draft: ${gigs.draft}
  Filled: ${gigs.filled}
  Closed: ${gigs.closed}
  New (24h): ${gigs.new24h}
  New (7d): ${gigs.new7d}
  New (30d): ${gigs.new30d}

RECENT GIGS
${s.recentGigs.map((g) => `  • ${g.title || "(untitled)"} [${g.status}] (${g.created_at?.slice(0, 10)})`).join("\n") || "  (none)"}

APPLICATIONS
  Total: ${apps.total}
  Pending: ${apps.pending}
  Accepted: ${apps.accepted}
  Hired (accepted + in progress + completed + paid): ${apps.hired}
  Rejected: ${apps.rejected}
  New (24h): ${apps.new24h}
  New (7d): ${apps.new7d}

POSTS & FEED
  Total posts: ${posts.total}
  New posts (24h): ${posts.new24h}
  New posts (7d): ${posts.new7d}
  Total post comments: ${posts.comments}
  New comments (24h): ${posts.newComments24h}

SOCIAL
  Follows: ${social.follows} (+${social.newFollows24h} 24h)
  Endorsements: ${social.endorsements}
  Reviews: ${social.reviews} (+${social.newReviews24h} 24h)

MESSAGING
  Conversations: ${messaging.conversations} (+${messaging.newConversations24h} 24h)
  Messages: ${messaging.messages} (+${messaging.newMessages24h} 24h)

GIG INVOICES (worker -> poster, via CoinPay)
  Total: ${invoices.total}
  Paid: ${invoices.paid} (+${invoices.paid24h} 24h)
  Awaiting payment: ${invoices.awaitingPayment}
  New (24h): ${invoices.new24h}
  Created without a CoinPay id (24h): ${invoices.noCoinpayId24h} (id is minted when the poster pays)
  Created unpayable, no receiving wallet (24h): ${invoices.unpayable24h}${invoices.unpayable24h > 0 ? " <-- ALERT" : ""}

PRO / FUNDING / TIP CHECKOUTS (payments table)
  Total: ${payments.total}
  Confirmed: ${payments.confirmed}
  Forwarded: ${payments.forwarded}
  Pending: ${payments.pending}
  New (24h): ${payments.new24h}
`.trim();

  const row = (label: string, value: string | number, style = "") =>
    `<tr><td style="padding: 4px 0;">${label}</td><td style="text-align: right;${style}">${value}</td></tr>`;
  const green = (n: number) => ` font-weight: bold; color: ${n > 0 ? "#16a34a" : "#666"};`;
  const plus = (total: number, delta: number) =>
    `${total} <span style="color: #16a34a; font-weight: normal;">+${delta}</span>`;
  const h2 = (t: string) => `<h2 style="font-size: 16px; color: #6366f1; margin: 0 0 12px;">${t}</h2>`;
  const table = (rows: string[], mb = 20) =>
    `<table style="width: 100%; font-size: 14px; margin-bottom: ${mb}px;">${rows.join("")}</table>`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a2e; background: #f8f9fa;">
  <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 20px 24px; border-radius: 12px 12px 0 0;">
    <h1 style="margin: 0; font-size: 20px;">📊 ugig.net Daily Report</h1>
    <p style="margin: 4px 0 0; opacity: 0.9; font-size: 14px;">${s.date}</p>
  </div>
  <div style="background: white; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e0e0e0; border-top: none;">
    ${h2("👤 Users")}
    ${table([
      row("Total", users.total, " font-weight: bold;"),
      row("New (24h)", users.new24h, green(users.new24h)),
      row("New (7d)", users.new7d),
      row("New (30d)", users.new30d),
      row("Spam-flagged (all time)", users.spamFlagged),
    ])}
    ${s.recentUsers.length > 0 ? `
    <h3 style="font-size: 14px; color: #666; margin: 0 0 8px;">Recent Signups</h3>
    <ul style="font-size: 13px; padding-left: 20px; margin: 0 0 20px;">
      ${s.recentUsers.map((u) => `<li style="margin-bottom: 4px;"><strong>${esc(u.full_name || u.username || "(no name)")}</strong> <span style="color: #999;">@${esc(u.username)} · ${esc(u.created_at?.slice(0, 10))}</span></li>`).join("")}
    </ul>` : ""}
    ${h2("💼 Gigs")}
    ${table([
      row("Total", gigs.total, " font-weight: bold;"),
      row("Active", gigs.active, " color: #16a34a;"),
      row("&nbsp;&nbsp;jobs (hiring)", gigs.activeHiring),
      row("&nbsp;&nbsp;for-hire ads", gigs.activeForHire),
      row("Draft", gigs.draft),
      row("Filled", gigs.filled),
      row("Closed", gigs.closed),
      row("New (24h)", gigs.new24h, green(gigs.new24h)),
      row("New (7d)", gigs.new7d),
      row("New (30d)", gigs.new30d),
    ], 12)}
    ${s.recentGigs.length > 0 ? `
    <ul style="font-size: 13px; padding-left: 20px; margin: 0 0 20px;">
      ${s.recentGigs.map((g) => `<li style="margin-bottom: 4px;"><strong>${esc(g.title || "(untitled)")}</strong> <span style="color: #999;">[${esc(g.status)}] · ${esc(g.created_at?.slice(0, 10))}</span></li>`).join("")}
    </ul>` : `<div style="margin-bottom: 20px;"></div>`}
    ${h2("📋 Applications")}
    ${table([
      row("Total", apps.total, " font-weight: bold;"),
      row("Pending", apps.pending),
      row("Accepted", apps.accepted, " color: #16a34a;"),
      row("Hired (incl. in progress / completed / paid)", apps.hired),
      row("Rejected", apps.rejected, " color: #dc2626;"),
      row("New (24h)", apps.new24h, green(apps.new24h)),
      row("New (7d)", apps.new7d),
    ])}
    ${h2("📝 Posts & Feed")}
    ${table([
      row("Total posts", posts.total, " font-weight: bold;"),
      row("New posts (24h)", posts.new24h, green(posts.new24h)),
      row("New posts (7d)", posts.new7d),
      row("Total comments", posts.comments),
      row("New comments (24h)", posts.newComments24h, green(posts.newComments24h)),
    ])}
    ${h2("🤝 Social")}
    ${table([
      row("Follows", plus(social.follows, social.newFollows24h), " font-weight: bold;"),
      row("Endorsements", social.endorsements),
      row("Reviews", plus(social.reviews, social.newReviews24h)),
    ])}
    ${h2("💬 Messaging")}
    ${table([
      row("Conversations", plus(messaging.conversations, messaging.newConversations24h), " font-weight: bold;"),
      row("Messages", plus(messaging.messages, messaging.newMessages24h)),
    ])}
    ${h2("🧾 Gig invoices (worker → poster)")}
    ${table([
      row("Total", invoices.total, " font-weight: bold;"),
      row("Paid", plus(invoices.paid, invoices.paid24h), " color: #16a34a;"),
      row("Awaiting payment", invoices.awaitingPayment),
      row("New (24h)", invoices.new24h, green(invoices.new24h)),
      row("Created without a CoinPay id (24h)", invoices.noCoinpayId24h),
      row(
        "Created unpayable, no wallet (24h)",
        invoices.unpayable24h,
        invoices.unpayable24h > 0 ? " font-weight: bold; color: #dc2626;" : ""
      ),
    ])}
    ${h2("💰 Pro / funding / tip checkouts")}
    ${table([
      row("Total", payments.total, " font-weight: bold;"),
      row("Confirmed", payments.confirmed, " color: #16a34a;"),
      row("Forwarded", payments.forwarded),
      row("Pending", payments.pending),
      row("New (24h)", payments.new24h, green(payments.new24h)),
    ])}
  </div>
  <p style="text-align: center; font-size: 12px; color: #999; margin-top: 16px;">
    Sent by ugig Stats · <a href="https://ugig.net" style="color: #6366f1;">ugig.net</a>
  </p>
</body>
</html>
`.trim();

  return {
    subject: `📊 ugig Daily — ${s.date} | ${users.total} users, ${gigs.total} gigs, ${messaging.messages} msgs`,
    html,
    text,
  };
}

export const DAILY_STATS_TO = "anthony@profullstack.com";
export const DAILY_STATS_FROM = "ugig Stats <stats@ugig.net>";

export async function sendDailyStatsEmail(
  report: { subject: string; html: string; text: string },
  opts: { apiKey?: string; to?: string; from?: string } = {}
): Promise<string | null> {
  const apiKey = opts.apiKey ?? process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: opts.from ?? process.env.STATS_FROM_EMAIL ?? DAILY_STATS_FROM,
    to: opts.to ?? DAILY_STATS_TO,
    subject: report.subject,
    html: report.html,
    text: report.text,
  });
  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
  return data?.id ?? null;
}
