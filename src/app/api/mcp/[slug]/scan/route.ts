import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { combinedScan, MCP_SCANNER_VERSION } from "@/lib/mcp/security-scan";

/**
 * POST /api/mcp/[slug]/scan — Generate an MCP security report
 *
 * Triggers SpiderShield + mcp-scan on the MCP server listing.
 * Only the listing owner (seller) can trigger a scan.
 *
 * Persists an mcp_security_scans row and updates the listing's
 * cached scan_status + scan_rating.
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
      .select("id, seller_id, slug, mcp_server_url, source_url")
      .eq("slug", slug)
      .single();

    if (listingError || !listing) {
      return NextResponse.json({ error: "MCP listing not found" }, { status: 404 });
    }

    const l = listing as any;

    // Only owner can trigger scans
    if (l.seller_id !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Need at least a server URL or source URL to scan
    if (!l.mcp_server_url && !l.source_url) {
      return NextResponse.json(
        { error: "No scannable content — add a server URL or source URL" },
        { status: 422 }
      );
    }

    // ── Run combined scan ─────────────────────────────────────────
    const targetUrl = l.mcp_server_url || l.source_url;
    const sourceContext = l.mcp_server_url ? (l.source_url || undefined) : undefined;

    const scanResult = await combinedScan(targetUrl, sourceContext);

    // ── Persist scan record ───────────────────────────────────────
    const { data: scanRecord, error: scanInsertError } = await admin
      .from("mcp_security_scans" as any)
      .insert({
        listing_id: l.id,
        scanner_version: scanResult.scannerVersion,
        status: scanResult.status,
        rating: scanResult.rating,
        security_score: scanResult.securityScore,
        findings: scanResult.findings,
        spidershield_report: scanResult.spidershieldReport,
        mcp_scan_report: scanResult.mcpScanReport,
      })
      .select("id")
      .single();

    if (scanInsertError) {
      console.error("Failed to persist MCP scan record:", scanInsertError);
    }

    // Update listing cached scan_status + scan_rating
    await admin
      .from("mcp_listings" as any)
      .update({
        scan_status: scanResult.status,
        scan_rating: scanResult.rating,
      })
      .eq("id", l.id);

    // ── Return sanitised response ─────────────────────────────────
    return NextResponse.json({
      scan: {
        status: scanResult.status,
        rating: scanResult.rating,
        security_score: scanResult.securityScore,
        findings_count: scanResult.findings.length,
        findings: scanResult.findings.map((f) => ({
          source: f.source,
          severity: f.severity,
          detail: f.detail,
        })),
        spidershield_available: scanResult.spidershieldReport.available,
        mcp_scan_available: scanResult.mcpScanReport.available,
        scanner_version: scanResult.scannerVersion,
        scan_id: (scanRecord as any)?.id ?? null,
        scanned_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("MCP scan error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
