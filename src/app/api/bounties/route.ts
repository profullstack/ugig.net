import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createBountySchema, formatBountyPayout } from "@/lib/bounties";
import { parseGitHubIssueUrl } from "@/lib/github-links";
import { postIssueComment } from "@/lib/github-app";

// Post the "bounty posted" status comment on the funded GitHub issue.
// Returns the comment id (to store for later editing) or null. Best-effort.
async function postBountyIssueComment(bounty: {
  id: string;
  title: string;
  payout_usd: number | string;
  payment_coin: string | null;
  github_issue_url: string;
}): Promise<number | null> {
  const coords = parseGitHubIssueUrl(bounty.github_issue_url);
  if (!coords) return null;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net").replace(/\/$/, "");
  const bountyUrl = `${appUrl}/bounties/${bounty.id}`;
  const body =
    `💰 **Bounty posted on [ugig.net](${appUrl})** — ${formatBountyPayout(bounty.payout_usd, bounty.payment_coin)}\n\n` +
    `**${bounty.title}**\n\n` +
    `[Claim this bounty →](${bountyUrl})\n\n` +
    `<sub>Posted automatically by ugig.net.</sub>`;
  return postIssueComment(coords.owner, coords.repo, coords.number, body);
}

const BOUNTY_STATUSES = ["open", "paused", "closed"] as const;
type BountyStatus = (typeof BOUNTY_STATUSES)[number];

// GET /api/bounties — public list of bounties
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const statusParam = params.get("status") || "open";
    if (!(BOUNTY_STATUSES as readonly string[]).includes(statusParam)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${BOUNTY_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    const status = statusParam as BountyStatus;

    const defaultLimit = 50;
    const limitRaw = Number(params.get("limit"));
    if (params.get("limit") !== null && (!Number.isFinite(limitRaw) || limitRaw <= 0)) {
      return NextResponse.json(
        { error: "Invalid limit. Must be a positive integer." },
        { status: 400 }
      );
    }
    const limitCandidate =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : defaultLimit;
    const limit = Math.min(limitCandidate, 100);

    const pageRaw = Number(params.get("page"));
    if (params.get("page") !== null && (!Number.isFinite(pageRaw) || pageRaw <= 0)) {
      return NextResponse.json(
        { error: "Invalid page. Must be a positive integer." },
        { status: 400 }
      );
    }
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
    const offset = (page - 1) * limit;

    const supabase = await createClient();

    const { data, error, count } = await supabase
      .from("bounties" as any)
      .select(
        `
        id, title, description, payout_usd, payout_currency, payment_coin,
        max_submissions, status, closes_at, questions, created_at, updated_at,
        creator:profiles!creator_id (id, username, full_name, avatar_url)
      `,
        { count: "exact" }
      )
      .eq("status", status)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[GET /api/bounties] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({
      data: data || [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        total_pages: count ? Math.ceil(count / limit) : 0,
      },
    });
  } catch (err) {
    console.error("[GET /api/bounties] Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

// POST /api/bounties — create a bounty
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Malformed JSON body" },
        { status: 400 }
      );
    }
    const parsed = createBountySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0].message,
          issues: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    // Assign ids to any questions missing them
    const questions = parsed.data.questions.map((q) => ({
      ...q,
      id: q.id || randomUUID(),
    }));

    const { data, error } = await (supabase as any)
      .from("bounties")
      .insert({
        creator_id: user.id,
        title: parsed.data.title,
        description: parsed.data.description,
        payout_usd: parsed.data.payout_usd,
        payout_currency: parsed.data.payout_currency || "USD",
        payment_coin: parsed.data.payment_coin || null,
        max_submissions: parsed.data.max_submissions ?? null,
        closes_at: parsed.data.closes_at || null,
        github_issue_url: parsed.data.github_issue_url ?? null,
        questions,
      })
      .select()
      .single();

    if (error) {
      console.error("[POST /api/bounties] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Best-effort: if the bounty funds a GitHub issue and the ugig App is
    // installed on that repo, post a status comment and remember its id so we
    // can edit it to "paid" later. Never blocks bounty creation.
    if (data?.github_issue_url) {
      const commentId = await postBountyIssueComment(data);
      if (commentId) {
        await (supabase as any)
          .from("bounties")
          .update({ github_comment_id: commentId })
          .eq("id", data.id);
        data.github_comment_id = commentId;
      }
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/bounties] Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
