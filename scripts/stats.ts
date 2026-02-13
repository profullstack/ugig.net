#!/usr/bin/env npx tsx
/**
 * ugig.net Stats Dashboard
 * Usage: npx tsx scripts/stats.ts
 */

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function count(table: string, filter?: Record<string, unknown>) {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) {
    for (const [col, val] of Object.entries(filter)) {
      if (val === null) q = q.is(col, null);
      else if (typeof val === "string" && val.startsWith("not."))
        q = q.not(col, "is", null);
      else q = q.eq(col, val);
    }
  }
  const { count: c, error } = await q;
  if (error) {
    console.error(`  Error counting ${table}:`, error.message);
    return 0;
  }
  return c ?? 0;
}

async function countSince(table: string, col: string, days: number) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { count: c } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte(col, since);
  return c ?? 0;
}

function header(title: string) {
  console.log(`\n${"═".repeat(50)}`);
  console.log(`  ${title}`);
  console.log("═".repeat(50));
}

function line(label: string, value: number | string) {
  console.log(`  ${label.padEnd(35)} ${value}`);
}

async function main() {
  console.log("📊 ugig.net Stats Dashboard");
  console.log(`   ${new Date().toISOString()}\n`);

  // ── Users ──
  header("👤 Users");
  const totalUsers = await count("profiles");
  const verifiedUsers = await count("profiles", { email_confirmed_at: "not.null" });
  const unverified = totalUsers - verifiedUsers;
  const humans = await count("profiles", { account_type: "human" });
  const agents = await count("profiles", { account_type: "agent" });
  const newUsers7d = await countSince("profiles", "created_at", 7);
  const newUsers30d = await countSince("profiles", "created_at", 30);

  line("Total users", totalUsers);
  line("  Email verified", verifiedUsers);
  line("  Unverified", unverified);
  line("  Humans", humans);
  line("  Agents", agents);
  line("  New (7 days)", newUsers7d);
  line("  New (30 days)", newUsers30d);

  // ── Gigs ──
  header("💼 Gigs");
  const totalGigs = await count("gigs");
  const openGigs = await count("gigs", { status: "open" });
  const filledGigs = await count("gigs", { status: "filled" });
  const newGigs7d = await countSince("gigs", "created_at", 7);
  const newGigs30d = await countSince("gigs", "created_at", 30);

  line("Total gigs", totalGigs);
  line("  Open", openGigs);
  line("  Filled", filledGigs);
  line("  New (7 days)", newGigs7d);
  line("  New (30 days)", newGigs30d);

  // ── Applications ──
  header("📋 Applications");
  const totalApps = await count("applications");
  const pendingApps = await count("applications", { status: "pending" });
  const acceptedApps = await count("applications", { status: "accepted" });
  const rejectedApps = await count("applications", { status: "rejected" });
  const newApps7d = await countSince("applications", "created_at", 7);

  line("Total applications", totalApps);
  line("  Pending", pendingApps);
  line("  Accepted", acceptedApps);
  line("  Rejected", rejectedApps);
  line("  New (7 days)", newApps7d);

  // ── Posts / Feed ──
  header("📝 Posts");
  const totalPosts = await count("posts");
  const newPosts7d = await countSince("posts", "created_at", 7);
  const totalPostComments = await count("post_comments");

  line("Total posts", totalPosts);
  line("  New (7 days)", newPosts7d);
  line("  Total comments", totalPostComments);

  // ── Social ──
  header("🤝 Social");
  const totalFollows = await count("follows");
  const totalEndorsements = await count("endorsements");
  const totalReviews = await count("reviews");
  const totalConversations = await count("conversations");
  const totalMessages = await count("messages");

  line("Follows", totalFollows);
  line("Endorsements", totalEndorsements);
  line("Reviews", totalReviews);
  line("Conversations", totalConversations);
  line("Messages", totalMessages);

  // ── Payments ──
  header("💰 Payments");
  const totalPayments = await count("payments");
  const completedPayments = await count("payments", { status: "completed" });
  const pendingPayments = await count("payments", { status: "pending" });

  line("Total payments", totalPayments);
  line("  Completed", completedPayments);
  line("  Pending", pendingPayments);

  console.log(`\n${"═".repeat(50)}\n`);
}

main().catch(console.error);
