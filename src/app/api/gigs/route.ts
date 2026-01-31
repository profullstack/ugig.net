import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gigSchema, gigFiltersSchema } from "@/lib/validations";
import { getAuthContext } from "@/lib/auth/get-user";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";

// GET /api/gigs - List gigs (public)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse filters
    const filters = gigFiltersSchema.safeParse({
      search: searchParams.get("search") || undefined,
      category: searchParams.get("category") || undefined,
      skills: searchParams.get("skills")?.split(",").filter(Boolean) || undefined,
      budget_type: searchParams.get("budget_type") || undefined,
      budget_min: searchParams.get("budget_min")
        ? Number(searchParams.get("budget_min"))
        : undefined,
      budget_max: searchParams.get("budget_max")
        ? Number(searchParams.get("budget_max"))
        : undefined,
      location_type: searchParams.get("location_type") || undefined,
      account_type: searchParams.get("account_type") || undefined,
      sort: searchParams.get("sort") || "newest",
      page: Number(searchParams.get("page")) || 1,
      limit: Number(searchParams.get("limit")) || 20,
    });

    if (!filters.success) {
      return NextResponse.json(
        { error: filters.error.issues[0].message },
        { status: 400 }
      );
    }

    const { search, category, skills, budget_type, budget_min, budget_max, location_type, account_type, sort, page, limit } =
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
          account_type
        )
      `,
        { count: "exact" }
      )
      .eq("status", "active");

    // Apply filters
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    if (category) {
      query = query.eq("category", category);
    }

    if (skills && skills.length > 0) {
      query = query.overlaps("skills_required", skills);
    }

    if (budget_type) {
      query = query.eq("budget_type", budget_type);
    }

    if (budget_min !== undefined) {
      query = query.gte("budget_max", budget_min);
    }

    if (budget_max !== undefined) {
      query = query.lte("budget_min", budget_max);
    }

    if (location_type) {
      query = query.eq("location_type", location_type);
    }

    if (account_type) {
      query = query.eq("poster:profiles!poster_id.account_type", account_type);
    }

    // Apply sorting
    switch (sort) {
      case "oldest":
        query = query.order("created_at", { ascending: true });
        break;
      case "budget_high":
        query = query.order("budget_max", { ascending: false, nullsFirst: false });
        break;
      case "budget_low":
        query = query.order("budget_min", { ascending: true, nullsFirst: false });
        break;
      default: // newest
        query = query.order("created_at", { ascending: false });
    }

    // Apply pagination
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data: gigs, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      gigs,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// POST /api/gigs - Create a gig
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const rl = checkRateLimit(getRateLimitIdentifier(request, user.id), "write");
    if (!rl.allowed) return rateLimitExceeded(rl);

    const body = await request.json();
    const validationResult = gigSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const isActivePost = validationResult.data.status === "active";
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    // Only check gig limit for active posts
    if (isActivePost) {
      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("plan")
        .eq("user_id", user.id)
        .single();

      if (!subscription || subscription.plan === "free") {
        const { data: usage } = await supabase
          .from("gig_usage")
          .select("posts_count")
          .eq("user_id", user.id)
          .eq("month", month)
          .eq("year", year)
          .single();

        if (usage && usage.posts_count >= 10) {
          return NextResponse.json(
            {
              error:
                "You've reached your monthly limit of 10 gig posts. Upgrade to Pro for unlimited posts.",
            },
            { status: 403 }
          );
        }
      }
    }

    // Create the gig
    const { data: gig, error } = await supabase
      .from("gigs")
      .insert({
        poster_id: user.id,
        ...validationResult.data,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Only update usage count for active posts
    if (isActivePost) {
      await supabase.from("gig_usage").upsert(
        {
          user_id: user.id,
          month,
          year,
          posts_count: 1,
        },
        {
          onConflict: "user_id,month,year",
        }
      );

      await supabase.rpc("increment_gig_usage", {
        p_user_id: user.id,
        p_month: month,
        p_year: year,
      });
    }

    return NextResponse.json({ gig }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
