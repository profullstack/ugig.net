import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/mcp/[slug]/download - Get MCP server connection details
 *
 * Entitlement check:
 *   - Seller (owner) can always access
 *   - Buyer who purchased can access
 *   - Free listings (price_sats=0) require a purchase record (claim)
 *
 * Returns the MCP server URL and connection instructions.
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

    const admin = createServiceClient();

    // Fetch listing
    const { data: listing, error: listingError } = await admin
      .from("mcp_listings" as any)
      .select("id, seller_id, mcp_server_url, transport_type, supported_tools, status, price_sats, downloads_count, title")
      .eq("slug", slug)
      .single();

    if (listingError || !listing) {
      return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    }

    const l = listing as any;

    // Must be active or owned by seller
    if (l.status !== "active" && l.seller_id !== auth.user.id) {
      return NextResponse.json({ error: "MCP server is not available" }, { status: 404 });
    }

    // Must have a server URL
    if (!l.mcp_server_url) {
      return NextResponse.json({ error: "No server URL available" }, { status: 404 });
    }

    // Entitlement check
    const isOwner = l.seller_id === auth.user.id;

    if (!isOwner) {
      // Check purchase record
      const { data: purchase } = await admin
        .from("mcp_purchases" as any)
        .select("id")
        .eq("listing_id", l.id)
        .eq("buyer_id", auth.user.id)
        .single();

      if (!purchase) {
        return NextResponse.json(
          { error: "Purchase required to access this MCP server" },
          { status: 403 }
        );
      }
    }

    // Track download/access count (best-effort)
    await admin
      .from("mcp_listings" as any)
      .update({ downloads_count: (l.downloads_count ?? 0) + 1 })
      .eq("id", l.id);

    return NextResponse.json({
      mcp_server_url: l.mcp_server_url,
      transport_type: l.transport_type,
      supported_tools: l.supported_tools || [],
      title: l.title,
    });
  } catch (err) {
    console.error("MCP download error:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
