import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { submitAnswersSchema, validateAnswers, BountyQuestion } from "@/lib/bounties";

// GET /api/bounties/[id]/submissions — creator sees all, submitter sees own
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const { data: bounty } = await (supabase as any)
      .from("bounties")
      .select("id, creator_id")
      .eq("id", id)
      .single();

    if (!bounty) {
      return NextResponse.json({ error: "Bounty not found" }, { status: 404 });
    }

    let query = (supabase as any)
      .from("bounty_submissions")
      .select(
        `
        *,
        submitter:profiles!submitter_id (id, username, full_name, avatar_url)
      `
      )
      .eq("bounty_id", id);

    if (bounty.creator_id !== user.id) {
      query = query.eq("submitter_id", user.id);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data: data || [] });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

// POST /api/bounties/[id]/submissions — submit answers (must be logged in)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const body = await request.json();
    const parsed = submitAnswersSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Load the bounty to validate answers + enforce open/max_submissions
    const { data: bounty } = await (supabase as any)
      .from("bounties")
      .select("id, creator_id, title, status, max_submissions, questions")
      .eq("id", id)
      .single();
    if (!bounty) {
      return NextResponse.json({ error: "Bounty not found" }, { status: 404 });
    }
    if (bounty.creator_id === user.id) {
      return NextResponse.json(
        { error: "You can't submit to your own bounty" },
        { status: 400 }
      );
    }
    if (bounty.status !== "open") {
      return NextResponse.json(
        { error: "This bounty is not accepting submissions" },
        { status: 400 }
      );
    }

    const questions = (bounty.questions || []) as BountyQuestion[];
    const validationError = validateAnswers(questions, parsed.data.answers);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Check submission cap. Done in two steps (count + insert) — a race here
    // could let one extra submission slip past, which is acceptable.
    if (bounty.max_submissions) {
      const { count } = await (supabase as any)
        .from("bounty_submissions")
        .select("id", { count: "exact", head: true })
        .eq("bounty_id", id);
      if ((count ?? 0) >= bounty.max_submissions) {
        // Auto-close so the next visitor sees it as closed
        await (supabase as any)
          .from("bounties")
          .update({ status: "closed" })
          .eq("id", id);
        return NextResponse.json(
          { error: "This bounty has reached its submission cap" },
          { status: 400 }
        );
      }
    }

    const { data, error } = await (supabase as any)
      .from("bounty_submissions")
      .insert({
        bounty_id: id,
        submitter_id: user.id,
        answers: parsed.data.answers,
      })
      .select()
      .single();

    if (error) {
      // Unique violation = duplicate submission
      if ((error as { code?: string }).code === "23505") {
        return NextResponse.json(
          { error: "You've already submitted to this bounty" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // After insert: if we just hit the cap, auto-close.
    if (bounty.max_submissions) {
      const { count } = await (supabase as any)
        .from("bounty_submissions")
        .select("id", { count: "exact", head: true })
        .eq("bounty_id", id);
      if ((count ?? 0) >= bounty.max_submissions) {
        await (supabase as any)
          .from("bounties")
          .update({ status: "closed" })
          .eq("id", id);
      }
    }

    // Notify the creator
    const { data: submitterProfile } = await supabase
      .from("profiles")
      .select("username, full_name")
      .eq("id", user.id)
      .single();
    const name =
      submitterProfile?.full_name || submitterProfile?.username || "Someone";
    await supabase.from("notifications").insert({
      user_id: bounty.creator_id,
      type: "payment_received",
      title: "New bounty submission",
      body: `${name} submitted to "${bounty.title}".`,
      data: { bounty_id: id, submission_id: data.id },
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
