import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { updateBountySchema, bountyDeleteBlockReason } from "@/lib/bounties";
import {
  bountyPostedCommentBody,
  bountyWithdrawnCommentBody,
} from "@/lib/bounty-issue-comments";
import { parseGitHubIssueUrl } from "@/lib/github-links";
import { updateIssueComment } from "@/lib/github-app";

interface CommentedBounty {
  id: string;
  title: string;
  payout_usd: number | string;
  payment_coin: string | null;
  github_issue_url: string | null;
  github_comment_id: number | null;
}

// Best-effort edit of the GitHub issue status comment. Archiving or deleting
// leaves a "Claim this bounty" link that no longer resolves, so the comment is
// flipped to "withdrawn"; reopening flips it back. Never blocks the request.
async function syncIssueComment(bounty: CommentedBounty, kind: "posted" | "withdrawn") {
  if (!bounty.github_issue_url || !bounty.github_comment_id) return;
  const coords = parseGitHubIssueUrl(bounty.github_issue_url);
  if (!coords) return;
  const body =
    kind === "withdrawn" ? bountyWithdrawnCommentBody(bounty) : bountyPostedCommentBody(bounty);
  await updateIssueComment(coords.owner, coords.repo, bounty.github_comment_id, body);
}

const OWNER_FIELDS =
  "id, creator_id, title, status, payout_usd, payment_coin, github_issue_url, github_comment_id";

// GET /api/bounties/[id] — single bounty, public if open
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("bounties" as any)
      .select(
        `
        *,
        creator:profiles!creator_id (id, username, full_name, avatar_url)
      `
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Bounty not found" }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

// PATCH /api/bounties/[id] — creator only
export async function PATCH(
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
    const parsed = updateBountySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { data: existing } = await (supabase as any)
      .from("bounties")
      .select(OWNER_FIELDS)
      .eq("id", id)
      .single();
    if (!existing) {
      return NextResponse.json({ error: "Bounty not found" }, { status: 404 });
    }
    if (existing.creator_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await (supabase as any)
      .from("bounties")
      .update(parsed.data)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const next = parsed.data.status;
    if (next && next !== existing.status) {
      if (next === "archived") {
        await syncIssueComment(data, "withdrawn");
      } else if (next === "open" && existing.status === "archived") {
        await syncIssueComment(data, "posted");
      }
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

// DELETE /api/bounties/[id] — creator only. Refused once a submission has
// been approved, invoiced or paid: those rows are payment history and the
// cascade would erase them. Archive (PATCH status=archived) instead.
export async function DELETE(
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

    const { data: existing } = await (supabase as any)
      .from("bounties")
      .select(OWNER_FIELDS)
      .eq("id", id)
      .single();
    if (!existing) {
      return NextResponse.json({ error: "Bounty not found" }, { status: 404 });
    }
    if (existing.creator_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: submissions, error: subsError } = await (supabase as any)
      .from("bounty_submissions")
      .select("status, payout_status")
      .eq("bounty_id", id);
    if (subsError) {
      return NextResponse.json({ error: subsError.message }, { status: 400 });
    }

    const blocked = bountyDeleteBlockReason(submissions || []);
    if (blocked) {
      return NextResponse.json({ error: blocked, archive_instead: true }, { status: 409 });
    }

    const { error } = await (supabase as any).from("bounties").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await syncIssueComment(existing, "withdrawn");

    return NextResponse.json({ message: "Bounty deleted" });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
