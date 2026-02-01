import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/auth/get-user";
import { sendEmail, profileReminderEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Find incomplete profiles created 24-72 hours ago that haven't been reminded
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const seventyTwoHoursAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000);

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, username, created_at")
      .eq("profile_completed", false)
      .is("reminder_sent_at", null)
      .gte("created_at", seventyTwoHoursAgo.toISOString())
      .lte("created_at", twentyFourHoursAgo.toISOString())
      .limit(100);

    if (profilesError) {
      console.error("Error fetching profiles for reminders:", profilesError);
      return NextResponse.json(
        { error: "Failed to fetch profiles" },
        { status: 500 }
      );
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ sent: 0, message: "No profiles need reminders" });
    }

    let sent = 0;
    let failed = 0;

    for (const profile of profiles) {
      try {
        // Look up email from auth admin API
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.admin.getUserById(profile.id);

        if (userError || !user?.email) {
          console.error(
            `Failed to get email for user ${profile.id}:`,
            userError
          );
          failed++;
          continue;
        }

        // Calculate days since signup
        const createdAt = new Date(profile.created_at);
        const daysAgo = Math.round(
          (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
        );

        const reminder = profileReminderEmail({
          name: profile.full_name || profile.username,
          daysAgo,
        });

        const result = await sendEmail({
          to: user.email,
          subject: reminder.subject,
          html: reminder.html,
          text: reminder.text,
        });

        if (result.success) {
          // Mark as reminded
          await supabase
            .from("profiles")
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq("id", profile.id);
          sent++;
        } else {
          failed++;
        }
      } catch (err) {
        console.error(`Error sending reminder to ${profile.id}:`, err);
        failed++;
      }
    }

    return NextResponse.json({
      sent,
      failed,
      total: profiles.length,
      message: `Sent ${sent} reminder(s), ${failed} failed`,
    });
  } catch (err) {
    console.error("Profile reminders cron error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
