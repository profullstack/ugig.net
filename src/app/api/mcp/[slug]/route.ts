import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { mcpListingSchema } from "@/lib/mcp/validation";
import { combinedScan } from "@/lib/mcp/security-scan";

/**
 * GET /api/mcp/[slug] - Get a single MCP listing by slug
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();

    const { data: listing, error } = await supabase
      .from("mcp_listings" as any)
      .select(
        `*, seller:profiles!seller_id (id, username, full_name, avatar_url, bio, account_type, verified)`
      )
      .eq("slug", slug)
      .single();

    if (error || !listing) {
      return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    }

    // Check if current user has purchased + their vote
    let purchased = false;
    let userVote: number | null = null;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: purchase } = await supabase
        .from("mcp_purchases" as any)
        .select("id")
        .eq("listing_id", (listing as any).id)
        .eq("buyer_id", user.id)
        .single();

      purchased = !!purchase;

      // Get user's vote
      const { data: vote } = await supabase
        .from("mcp_votes" as any)
        .select("vote_type")
        .eq("listing_id", (listing as any).id)
        .eq("user_id", user.id)
        .single();

      if (vote) {
        userVote = (vote as any).vote_type;
      }
    }

    // Fetch reviews
    const { data: reviews } = await supabase
      .from("mcp_reviews" as any)
      .select(
        `*, reviewer:profiles!reviewer_id (id, username, full_name, avatar_url)`
      )
      .eq("listing_id", (listing as any).id)
      .order("created_at", { ascending: false })
      .limit(20);

    // Fetch zap totals for this listing
    const admin = createServiceClient();
    const { data: zapAgg } = await admin
      .from("zaps" as any)
      .select("amount_sats")
      .eq("target_type", "mcp")
      .eq("target_id", (listing as any).id);

    const zapsTotal = (zapAgg || []).reduce((sum: number, z: any) => sum + (z.amount_sats || 0), 0);

    return NextResponse.json({
      listing: { ...(listing as any), zaps_total: zapsTotal },
      purchased,
      user_vote: userVote,
      reviews: reviews || [],
    });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

/**
 * PATCH /api/mcp/[slug] - Update an MCP listing (owner only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createServiceClient();

    // Verify ownership
    const { data: existing } = await admin
      .from("mcp_listings" as any)
      .select("id, seller_id")
      .eq("slug", slug)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    }

    if ((existing as any).seller_id !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = mcpListingSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.tagline !== undefined) updateData.tagline = parsed.data.tagline || null;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.price_sats !== undefined) updateData.price_sats = parsed.data.price_sats;
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category || null;
    if (parsed.data.tags !== undefined) updateData.tags = parsed.data.tags;
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
    if (parsed.data.mcp_server_url !== undefined) updateData.mcp_server_url = parsed.data.mcp_server_url || null;
    if (parsed.data.source_url !== undefined) updateData.source_url = parsed.data.source_url || null;
    if (parsed.data.transport_type !== undefined) updateData.transport_type = parsed.data.transport_type || null;
    if (parsed.data.supported_tools !== undefined) updateData.supported_tools = parsed.data.supported_tools;

    const { data: listing, error } = await admin
      .from("mcp_listings" as any)
      .update(updateData)
      .eq("id", (existing as any).id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Auto-rescan if mcp_server_url or source_url changed
    const urlChanged = parsed.data.mcp_server_url !== undefined || parsed.data.source_url !== undefined;
    if (urlChanged && listing) {
      const l = listing as any;
      const scanTarget = l.mcp_server_url || l.source_url;
      if (scanTarget) {
        const sourceContext = l.mcp_server_url ? (l.source_url || undefined) : undefined;
        combinedScan(scanTarget, sourceContext)
          .then(async (scanResult) => {
            try {
              await admin.from("mcp_security_scans" as any).insert({
                listing_id: l.id,
                scanner_version: scanResult.scannerVersion,
                status: scanResult.status,
                rating: scanResult.rating,
                security_score: scanResult.securityScore,
                findings: scanResult.findings,
                spidershield_report: scanResult.spidershieldReport,
                mcp_scan_report: scanResult.mcpScanReport,
              });
              await admin.from("mcp_listings" as any).update({
                scan_status: scanResult.status,
                scan_rating: scanResult.rating,
              }).eq("id", l.id);
              console.log(`[MCP Auto-Scan] ${slug} updated: ${scanResult.status}`);
            } catch (err) {
              console.error("[MCP Auto-Scan] Store failed:", err);
            }
          })
          .catch((err) => console.error("[MCP Auto-Scan] Scan failed:", err));
      }
    }

    return NextResponse.json({ listing });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

/**
 * DELETE /api/mcp/[slug] - Archive an MCP listing (owner only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createServiceClient();

    const { data: existing } = await admin
      .from("mcp_listings" as any)
      .select("id, seller_id")
      .eq("slug", slug)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    }

    if ((existing as any).seller_id !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Soft-delete: archive instead of hard delete
    await admin
      .from("mcp_listings" as any)
      .update({ status: "archived" })
      .eq("id", (existing as any).id);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
