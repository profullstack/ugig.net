import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { referralInviteEmail, sendEmail } from "@/lib/email";
import { createServiceClient } from "@/lib/supabase/service";

type AnySupabase = any;
const MAX_EMAIL_ENTRIES_PER_REQUEST = 200;
const MAX_INVITES_PER_REQUEST = 20;

async function readJsonObject(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

// GET /api/referrals - List my referrals
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const { data: referrals, error } = await (supabase as AnySupabase)
      .from("referrals")
      .select("*")
      .eq("referrer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const total = referrals?.length || 0;
    const registered = referrals?.filter((r: any) => r.status !== "pending").length || 0;

    return NextResponse.json({
      data: referrals,
      stats: {
        total_invited: total,
        total_registered: registered,
        conversion_rate: total > 0 ? Math.round((registered / total) * 100) : 0,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// POST /api/referrals - Send invites
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }
    const { emails } = body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { error: "Please provide an array of emails" },
        { status: 400 }
      );
    }

    if (!emails.every((email: unknown) => typeof email === "string")) {
      return NextResponse.json(
        { error: "All email entries must be strings" },
        { status: 400 }
      );
    }

    if (emails.length > MAX_EMAIL_ENTRIES_PER_REQUEST) {
      return NextResponse.json(
        { error: `Maximum ${MAX_EMAIL_ENTRIES_PER_REQUEST} email entries at a time` },
        { status: 400 }
      );
    }

    // Validate email syntax BEFORE rate-limit checks (#143)
    // Only valid emails should count toward throttle limits
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedEmails = emails.map((e: string) => e.trim().toLowerCase());
    const validEmails = Array.from(
      new Set(normalizedEmails.filter((e: string) => emailRegex.test(e)))
    );

    if (validEmails.length === 0) {
      return NextResponse.json(
        { error: "No valid email addresses provided" },
        { status: 400 }
      );
    }

    if (validEmails.length > MAX_INVITES_PER_REQUEST) {
      return NextResponse.json(
        { error: `Maximum ${MAX_INVITES_PER_REQUEST} invites at a time` },
        { status: 400 }
      );
    }

    // Spam throttling: max 50 invites per day, max 10 per hour
    // Only count valid emails toward rate limits (#143)
    const svc = createServiceClient();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count: hourlyCount } = await (svc as AnySupabase)
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", user.id)
      .gte("created_at", oneHourAgo);

    if ((hourlyCount ?? 0) + validEmails.length > 10) {
      return NextResponse.json(
        { error: "Too many invites. Max 10 per hour." },
        { status: 429 }
      );
    }

    const { count: dailyCount } = await (svc as AnySupabase)
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", user.id)
      .gte("created_at", oneDayAgo);

    if ((dailyCount ?? 0) + validEmails.length > 50) {
      return NextResponse.json(
        { error: "Daily invite limit reached. Max 50 per day." },
        { status: 429 }
      );
    }

    // Prevent duplicate invites to same email
    const { data: existingInvites } = await (svc as AnySupabase)
      .from("referrals")
      .select("referred_email")
      .eq("referrer_id", user.id)
      .in("referred_email", validEmails);

    const alreadyInvited = new Set((existingInvites || []).map((r: any) => r.referred_email));

    // Get user's referral code
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("referral_code, username, full_name")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const referralCode = profile.referral_code || profile.username;
    const inviterName = profile.full_name || profile.username || "Someone";

    // Filter valid emails that aren't already invited (#143)
    const newValidEmails = validEmails.filter((e: string) => !alreadyInvited.has(e));

    if (newValidEmails.length === 0) {
      return NextResponse.json(
        { error: "All these emails have already been invited" },
        { status: 400 }
      );
    }

    // Send emails BEFORE inserting into DB to avoid partial-state issues
    const emailContent = referralInviteEmail({ inviterName, referralCode });
    const emailResults = await Promise.all(
      newValidEmails.map((email: string) =>
        sendEmail({ to: email, ...emailContent })
      )
    );

    const successfulEmails = newValidEmails.filter((_, i) => emailResults[i]?.success);
    const failedEmailCount = emailResults.filter((r) => !r.success).length;

    if (successfulEmails.length === 0) {
      return NextResponse.json(
        { error: "Failed to send invitation emails. Please try again." },
        { status: 502 }
      );
    }

    // Only insert DB records for successfully delivered emails
    const referralRows = successfulEmails.map((email: string) => ({
      referrer_id: user.id,
      referred_email: email,
      referral_code: referralCode,
      status: "pending" as const,
    }));

    const { data: referrals, error } = await (supabase as AnySupabase)
      .from("referrals")
      .insert(referralRows)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      message: failedEmailCount > 0
        ? `${successfulEmails.length} invite(s) sent successfully; ${failedEmailCount} email(s) failed`
        : `${successfulEmails.length} invite(s) sent successfully`,
      data: referrals,
      email_delivery_failed: failedEmailCount,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
