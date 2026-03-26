import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { mcpListingSchema, slugify } from "@/lib/mcp/validation";
import { combinedScan, MCP_SCANNER_VERSION } from "@/lib/mcp/security-scan";

/**
 * GET /api/mcp - Public listing of active MCP servers
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search") || "";
    const category = url.searchParams.get("category") || "";
    const tag = url.searchParams.get("tag") || "";
    const sort = url.searchParams.get("sort") || "newest";
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = 20;
    const offset = (page - 1) * limit;

    const supabase = await createClient();

    let query = supabase
      .from("mcp_listings" as any)
      .select(
        `*, seller:profiles!seller_id (id, username, full_name, avatar_url, account_type, verified)`,
        { count: "exact" }
      )
      .eq("status", "active");

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,tagline.ilike.%${search}%`);
    }

    if (category) {
      query = query.eq("category", category);
    }

    if (tag) {
      const tags = tag.split(",").map((t) => t.trim());
      query = query.overlaps("tags", tags);
    }

    switch (sort) {
      case "popular":
        query = query.order("downloads_count", { ascending: false });
        break;
      case "rating":
        query = query.order("rating_avg", { ascending: false });
        break;
      case "price_low":
        query = query.order("price_sats", { ascending: true });
        break;
      case "price_high":
        query = query.order("price_sats", { ascending: false });
        break;
      default:
        query = query.order("created_at", { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data: listings, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      listings: listings || [],
      total: count || 0,
      page,
      per_page: limit,
    });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

/**
 * POST /api/mcp - Create a new MCP server listing (authenticated)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = mcpListingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const {
      title, tagline, description, price_sats, category, tags,
      status: requestedStatusRaw, mcp_server_url, source_url,
      transport_type, supported_tools,
    } = parsed.data;
    const requestedStatus = requestedStatusRaw || "active";

    // Generate unique slug
    let slug = slugify(title);
    if (!slug) slug = "mcp-server";

    const admin = createServiceClient();

    // Check for slug collision and append suffix
    const { data: existing } = await admin
      .from("mcp_listings" as any)
      .select("id")
      .eq("slug", slug)
      .single();

    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const { data: listing, error } = await admin
      .from("mcp_listings" as any)
      .insert({
        seller_id: auth.user.id,
        slug,
        title,
        tagline: tagline || null,
        description,
        price_sats,
        category: category || null,
        tags: tags || [],
        status: requestedStatus,
        mcp_server_url: mcp_server_url || null,
        source_url: source_url || null,
        transport_type: transport_type || null,
        supported_tools: supported_tools || [],
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Auto-scan in background (non-blocking) if server URL or source URL is provided
    const listingId = (listing as any).id;
    const scanTarget = mcp_server_url || source_url;
    if (scanTarget && listingId) {
      const sourceContext = mcp_server_url ? (source_url || undefined) : undefined;
      combinedScan(scanTarget, sourceContext)
        .then(async (scanResult) => {
          try {
            // Store scan record
            await admin
              .from("mcp_security_scans" as any)
              .insert({
                listing_id: listingId,
                scanner_version: scanResult.scannerVersion,
                status: scanResult.status,
                rating: scanResult.rating,
                security_score: scanResult.securityScore,
                findings: scanResult.findings,
                spidershield_report: scanResult.spidershieldReport,
                mcp_scan_report: scanResult.mcpScanReport,
              });

            // Update listing cached scan fields
            await admin
              .from("mcp_listings" as any)
              .update({
                scan_status: scanResult.status,
                scan_rating: scanResult.rating,
              })
              .eq("id", listingId);

            console.log(`[MCP Auto-Scan] ${slug}: ${scanResult.status} (${scanResult.rating || "unrated"})`);
          } catch (scanStoreErr) {
            console.error("[MCP Auto-Scan] Failed to store scan result:", scanStoreErr);
          }
        })
        .catch((scanErr) => {
          console.error("[MCP Auto-Scan] Scan failed for", slug, scanErr);
        });
    }

    return NextResponse.json({ listing }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
