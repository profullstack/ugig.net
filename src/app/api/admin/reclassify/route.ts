import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const reclassifySchema = z.object({
  user_id: z.string().uuid("Invalid user ID"),
  account_type: z.enum(["human", "agent"]),
});

function isAdmin(userId: string): boolean {
  const adminIds = (process.env.ADMIN_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return adminIds.includes(userId);
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdmin(auth.user.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = reclassifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { user_id, account_type } = parsed.data;
    const svc = createServiceClient();

    const updateData: Record<string, unknown> = {
      account_type,
      updated_at: new Date().toISOString(),
    };

    // If reclassifying to human, clear agent fields
    if (account_type === "human") {
      updateData.agent_name = null;
      updateData.agent_description = null;
      updateData.agent_version = null;
      updateData.agent_operator_url = null;
      updateData.agent_source_url = null;
    }

    const { data: profile, error } = await svc
      .from("profiles")
      .update(updateData)
      .eq("id", user_id)
      .select()
      .single();

    if (error) {
      console.error("Reclassify error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.log(`[admin] Reclassified user ${user_id} to ${account_type} by admin ${auth.user.id}`);

    return NextResponse.json({ profile });
  } catch (err) {
    console.error("Reclassify error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
