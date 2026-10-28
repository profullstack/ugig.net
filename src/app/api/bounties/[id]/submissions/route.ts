import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import {
  submitAnswersSchema,
  validateAnswers,
  formatSubmitAnswersError,
  BountyQuestion,
} from "@/lib/bounties";
import { submissionReview } from "@/lib/bounty-review-status";
import { bountyPayoutReadiness, type BountyPayoutReadiness } from "@/lib/bounty-payout";
import { getCoinpayLink } from "@/lib/coinpay-oauth";

/**
 * Can the caller be paid for a submission to this bounty? Attached to the
 * caller's own submissions so an agent learns about a missing payout wallet
 * when it submits, not after the creator tries to pay. Never fails the request.
 */
async function callerPayout(
  supabase: any,
  userId: string,
  paymentCoin: unknown
): Promise<BountyPayoutReadiness | null> {
  try {
    const [{ data: profile }, link] = await Promise.all([
      supabase.from("profiles").select("wallet_addresses").eq("id", userId).single(),
      getCoinpayLink(userId),
    ]);
    return bountyPayoutReadiness({
      paymentCoin,
      linkWallets: link?.wallets,
      profileWalletAddresses: profile?.wallet_addresses,
    });
  } catch (err) {
    console.error("[bounty submissions] payout readiness failed:", err);
    return null;
  }
}

function bountyForReview(bounty: { status?: string | null; creator?: unknown }) {
  const creator = Array.isArray(bounty.creator) ? bounty.creator[0] : bounty.creator;
  return {
    status: bounty.status ?? null,
    creator_username: (creator as { username?: string } | null)?.username ?? null,
  };
}

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
      .select("id, creator_id, status, payment_coin, creator:profiles!creator_id (username)")
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
    // Every row says who reviews it, what happens next and how long it has
    // waited, so a submitter is never left with a bare "pending".
    const reviewBounty = bountyForReview(bounty);
    const ownRows = (data || []).some((row: any) => row.submitter_id === user.id);
    const payout = ownRows ? await callerPayout(supabase, user.id, bounty.payment_coin) : null;
    const rows = (data || []).map((row: any) => ({
      ...row,
      review: submissionReview(row, reviewBounty),
      ...(payout && row.submitter_id === user.id ? { payout } : {}),
    }));
    return NextResponse.json({ data: rows });
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
        { error: formatSubmitAnswersError(parsed.error) },
        { status: 400 }
      );
    }

    // Load the bounty to validate answers + enforce open/max_submissions
    const { data: bounty } = await (supabase as any)
      .from("bounties")
      .select("id, creator_id, title, status, max_submissions, questions, payment_coin, creator:profiles!creator_id (username)")
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

    const payout = await callerPayout(supabase, user.id, bounty.payment_coin);
    return NextResponse.json(
      {
        data: {
          ...data,
          review: submissionReview(data, bountyForReview(bounty)),
          ...(payout ? { payout } : {}),
        },
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
