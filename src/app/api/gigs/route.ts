import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gigSchema, gigFiltersSchema } from "@/lib/validations";
import { getAuthContext } from "@/lib/auth/get-user";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";
import { sanitizeTitle, sanitizeContent, stripProtoPollution } from "@/lib/sanitize";
import { getUserDid, onGigPosted } from "@/lib/reputation-hooks";
import { logActivity } from "@/lib/activity";

const MAX_GIG_PAGE = 100_000;
const MAX_GIG_LIMIT = 50;
const GIG_STATUSES = ["active", "paused", "closed"] as const;
type GigStatus = (typeof GIG_STATUSES)[number];

// GET /api/gigs - List gigs (public)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Validate raw query params that gigFiltersSchema doesn't cover
    const rawStatus = searchParams.get("status");
    const statusParam: GigStatus =
      rawStatus === null || rawStatus === ""
        ? "active"
        : (GIG_STATUSES as readonly string[]).includes(rawStatus)
          ? (rawStatus as GigStatus)
          : null;
    if (statusParam === null) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${GIG_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate page/limit are positive integers (not 0, not negative, not "abc")
    const pageRaw = searchParams.get("page");
    if (pageRaw !== null) {
      const v = Number(pageRaw);
      if (!Number.isFinite(v) || !Number.isInteger(v) || v < 1) {
        return NextResponse.json(
          { error: "Invalid page. Must be a positive integer (>= 1)." },
          { status: 400 }
        );
      }
    }
    const limitRaw = searchParams.get("limit");
    if (limitRaw !== null) {
      const v = Number(limitRaw);
      if (!Number.isFinite(v) || !Number.isInteger(v) || v < 1) {
        return NextResponse.json(
          { error: "Invalid limit. Must be a positive integer (>= 1)." },
          { status: 400 }
        );
      }
    }

    // Parse filters
    const filters = gigFiltersSchema.safeParse({
      search: (searchParams.get("search") || "").slice(0, 200) || undefined,
      category: searchParams.get("category") || undefined,
      skills: searchParams.get("skills")?.split(",").filter(Boolean) || undefined,
      budget_type: searchParams.get("budget_type") || undefined,
      budget_min: (() => { const v = Number(searchParams.get("budget_min")); return searchParams.get("budget_min") && Number.isFinite(v) ? v : undefined; })(),
      budget_max: (() => { const v = Number(searchParams.get("budget_max")); return searchParams.get("budget_max") && Number.isFinite(v) ? v : undefined; })(),
      location_type: searchParams.get("location_type") || undefined,
      account_type: searchParams.get("account_type") || undefined,
      listing_type: searchParams.get("listing_type") || undefined,
      sort: searchParams.get("sort") || "newest",
      page: pageRaw ? Math.min(Number(pageRaw), MAX_GIG_PAGE) : 1,
      limit: limitRaw ? Math.min(Number(limitRaw), MAX_GIG_LIMIT) : 20,
    });

    if (!filters.success) {
      return NextResponse.json(
        { error: filters.error.issues[0].message, issues: filters.error.issues },
        { status: 400 }
      );
    }

    const { search, category, skills, budget_type, budget_min, budget_max, location_type, account_type, listing_type, sort, page, limit } =
      filters.data;

    const supabase = await createClient();

    // Build query
    let query = supabase
      .from("gigs")
      .select(
        `
        *,
        poster:profiles!poster_id (
          id,
          username,
          full_name,
          avatar_url,
          account_type,
          verified,
          verification_type
        )
      `,
        { count: "exact" }
      )
      .eq("status", statusParam);

    // Apply filters — use textSearch or individual filters to prevent PostgREST filter injection (#71)
    if (search) {
      // Sanitize: escape PostgREST special chars and SQL wildcards
      const safeSearch = search
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_")
        .replace(/,/g, "\\,")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)")
        .replace(/\./g, "\\.");
      query = query.or(`title.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%`);
    }
