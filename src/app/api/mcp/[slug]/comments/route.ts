import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const MAX_COMMENT_DEPTH = 4;

const mcpCommentSchema = z.object({
  content: z.string().min(1, "Comment is required").max(2000, "Comment must be at most 2000 characters"),
  parent_id: z.string().uuid("Invalid parent comment ID").optional().nullable(),
});

interface CommentRow {
  id: string;
  listing_id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  depth: number;
  upvotes: number;
  downvotes: number;
  score: number;
  created_at: string;
  updated_at: string;
  author: any;
}

function normalizeAuthor(comment: CommentRow) {
  return {
    ...comment,
    author: Array.isArray(comment.author) ? comment.author[0] : comment.author,
  };
}

function buildCommentTree(comments: CommentRow[]) {
  const normalized = comments.map(normalizeAuthor);
  const byId = new Map<string, ReturnType<typeof normalizeAuthor> & { replies: ReturnType<typeof normalizeAuthor>[] }>();

  for (const c of normalized) {
    byId.set(c.id, { ...c, replies: [] });
  }

  const roots: (ReturnType<typeof normalizeAuthor> & { replies: ReturnType<typeof normalizeAuthor>[] })[] = [];

  for (const c of normalized) {
    const node = byId.get(c.id)!;
    if (c.parent_id && byId.has(c.parent_id)) {
      byId.get(c.parent_id)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * GET /api/mcp/[slug]/comments - List comments for an MCP listing
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();

    // Fetch listing
    const { data: listing } = await supabase
      .from("mcp_listings" as any)
      .select("id")
      .eq("slug", slug)
      .eq("status", "active")
      .single();

    if (!listing) {
      return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    }

    const listingId = (listing as any).id;

    const { data: comments, error } = await supabase
      .from("mcp_comments" as any)
      .select(
        `*, author:profiles!author_id (id, username, full_name, avatar_url)`
      )
      .eq("listing_id", listingId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const threads = buildCommentTree((comments || []) as unknown as CommentRow[]);

    return NextResponse.json({
      comments: threads,
      total: comments?.length || 0,
    });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

/**
 * POST /api/mcp/[slug]/comments - Create a comment on an MCP listing
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = mcpCommentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { content, parent_id } = parsed.data;
    const admin = createServiceClient();

    // Fetch listing
    const { data: listing } = await admin
      .from("mcp_listings" as any)
      .select("id, seller_id, title, status")
      .eq("slug", slug)
      .single();

    if (!listing) {
      return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    }

    if ((listing as any).status !== "active") {
      return NextResponse.json({ error: "MCP server is not available" }, { status: 400 });
    }

    const listingId = (listing as any).id;

    // Verify parent if replying
    let parentDepth = -1;
    if (parent_id) {
      const { data: parentComment } = await admin
        .from("mcp_comments" as any)
        .select("id, listing_id, depth")
        .eq("id", parent_id)
        .single();

      if (!parentComment) {
        return NextResponse.json({ error: "Parent comment not found" }, { status: 404 });
      }
      if ((parentComment as any).listing_id !== listingId) {
        return NextResponse.json(
          { error: "Parent comment belongs to a different listing" },
          { status: 400 }
        );
      }
      parentDepth = (parentComment as any).depth ?? 0;
      if (parentDepth >= MAX_COMMENT_DEPTH) {
        return NextResponse.json(
          { error: `Maximum comment depth of ${MAX_COMMENT_DEPTH + 1} levels reached.` },
          { status: 400 }
        );
      }
    }

    const newDepth = parent_id ? parentDepth + 1 : 0;

    // Create comment
    const { data: comment, error } = await admin
      .from("mcp_comments" as any)
      .insert({
        listing_id: listingId,
        author_id: auth.user.id,
        parent_id: parent_id || null,
        content,
        depth: newDepth,
      })
      .select(
        `*, author:profiles!author_id (id, username, full_name, avatar_url)`
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const c = comment as any;
    const normalizedComment = {
      ...c,
      author: Array.isArray(c.author) ? c.author[0] : c.author,
    };

    // Notify listing seller (if not self-commenting)
    if ((listing as any).seller_id !== auth.user.id) {
      await (admin.from("notifications") as any).insert({
        user_id: (listing as any).seller_id,
        type: "mcp_purchased", // reuse notification type
        title: `New comment on "${(listing as any).title}"`,
        body: content.slice(0, 200),
        data: {
          listing_id: listingId,
          comment_id: (comment as any).id,
          slug,
        },
      });
    }

    return NextResponse.json({ comment: normalizedComment }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
