import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { endorseSchema } from "@/lib/validations";
import { sendEmail, endorsementReceivedEmail } from "@/lib/email";
import { getUserDid, onEndorsementGiven } from "@/lib/reputation-hooks";

// POST /api/users/:username/endorse — endorse a skill
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;
    const { username } = await params;

    const body = await request.json();
    const validation = endorseSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { skill, comment } = validation.data;

    // Look up the endorsed user by username
    const { data: endorsedProfile } = await supabase
      .from("profiles")
      .select("id, username, full_name, skills")
      .eq("username", username)
      .single();

    if (!endorsedProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Cannot endorse yourself
    if (endorsedProfile.id === user.id) {
      return NextResponse.json(
        { error: "You cannot endorse yourself" },
        { status: 400 }
      );
    }

    // Skill must be listed on the user's profile
    const normalizedSkill = skill.trim();
    const profileSkills = (endorsedProfile.skills || []).map((s: string) =>
      s.toLowerCase()
    );
    if (!profileSkills.includes(normalizedSkill.toLowerCase())) {
      return NextResponse.json(
        {
          error: `"${normalizedSkill}" is not listed on this user's profile skills`,
        },
        { status: 400 }
      );
    }

    // Use the exact skill string from the profile (preserve casing)
    const exactSkill =
      (endorsedProfile.skills || []).find(
        (s: string) => s.toLowerCase() === normalizedSkill.toLowerCase()
      ) || normalizedSkill;

    // Insert endorsement (UNIQUE constraint handles duplicates)
    const { data: endorsement, error: insertError } = await supabase
      .from("endorsements")
      .insert({
        endorser_id: user.id,
        endorsed_id: endorsedProfile.id,
        skill: exactSkill,
        comment: comment || null,
      })
      .select(
        `
        *,
        endorser:profiles!endorsements_endorser_id_fkey (
          id, username, full_name, avatar_url
        )
      `
      )
      .single();

    if (insertError) {
      // Check for unique violation
      if (
        insertError.code === "23505" ||
        insertError.message?.includes("duplicate") ||
        insertError.message?.includes("unique")
      ) {
        return NextResponse.json(
          { error: "You have already endorsed this skill for this user" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    // Track reputation for endorsement
    const { data: endorsedUserProfile } = await supabase
      .from("profiles")
      .select("did")
      .eq("id", endorsedProfile.id)
      .single();
    const userDid = await getUserDid(supabase, user.id);
    if (userDid && endorsedUserProfile?.did) {
      onEndorsementGiven(userDid, endorsedUserProfile.did);
    }

    // Get endorser profile for notifications
    const { data: endorserProfile } = await supabase
      .from("profiles")
      .select("full_name, username")
      .eq("id", user.id)
      .single();

    const endorserName =
      endorserProfile?.full_name || endorserProfile?.username || "Someone";

    // Create in-app notification
    await supabase.from("notifications").insert({
      user_id: endorsedProfile.id,
      type: "endorsement_received" as "review_received",
      title: `${endorserName} endorsed your "${exactSkill}" skill`,
      body: comment || null,
      data: {
        endorsement_id: endorsement.id,
        endorser_id: user.id,
        endorser_username: endorserProfile?.username,
        skill: exactSkill,
      },
    });

    // Send email notification (best effort)
    if (user.email || endorsedProfile.id) {
      // Look up the endorsed user's email from auth (we can't directly — use profile id)
      // Email is sent best-effort; we need the endorsed user's email
      try {
        const endorsedName =
          endorsedProfile.full_name || endorsedProfile.username;
        // We don't have direct access to auth.users email from the client,
        // so we send to the profile owner if we can find their email
        // For API key auth we use service client which can query auth.users
        if (auth.user.authMethod === "api_key") {
          const { data: authUser } = await supabase.auth.admin.getUserById(
            endorsedProfile.id
          );
          if (authUser?.user?.email) {
            const emailContent = endorsementReceivedEmail({
              endorsedName,
              endorserName,
              skill: exactSkill,
              comment: comment || undefined,
              endorsedUsername: endorsedProfile.username,
            });
            await sendEmail({
              to: authUser.user.email,
              ...emailContent,
            });
          }
        }
      } catch {
        // Email is best-effort, don't fail the request
      }
    }

    return NextResponse.json({ data: endorsement }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// DELETE /api/users/:username/endorse — remove an endorsement
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;
    const { username } = await params;

    const { searchParams } = new URL(request.url);
    const skill = searchParams.get("skill");

    if (!skill) {
      return NextResponse.json(
        { error: "skill query parameter is required" },
        { status: 400 }
      );
    }

    // Look up the endorsed user
    const { data: endorsedProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (!endorsedProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("endorsements")
      .delete()
      .eq("endorser_id", user.id)
      .eq("endorsed_id", endorsedProfile.id)
      .eq("skill", skill);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ message: "Endorsement removed" });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
