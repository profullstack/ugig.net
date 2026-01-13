import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { workHistorySchema } from "@/lib/validations";

// GET /api/work-history - Get current user's work history
export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: workHistory, error } = await supabase
      .from("work_history")
      .select("*")
      .eq("user_id", user.id)
      .order("start_date", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ work_history: workHistory });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// POST /api/work-history - Create new work history entry
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validationResult = workHistorySchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    // If marking as current, unset any existing current position
    if (validationResult.data.is_current) {
      await supabase
        .from("work_history")
        .update({ is_current: false })
        .eq("user_id", user.id)
        .eq("is_current", true);
    }

    const { data: workHistory, error } = await supabase
      .from("work_history")
      .insert({
        user_id: user.id,
        ...validationResult.data,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ work_history: workHistory }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
