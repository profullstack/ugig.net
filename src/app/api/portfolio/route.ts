import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { portfolioItemSchema } from "@/lib/validations";
import { getUserDid, onPortfolioAdded } from "@/lib/reputation-hooks";

// GET /api/portfolio?user_id=<id> — list user's portfolio (public)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");

    if (!userId) {
      return NextResponse.json(
        { error: "user_id query parameter is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: items, error } = await supabase
      .from("portfolio_items")
      .select(
        `
        *,
        gig:gigs!gig_id (
          id,
          title
        )
      `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ portfolio_items: items });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// POST /api/portfolio — create item (auth required)
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const body = await request.json();
    const validationResult = portfolioItemSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Clean empty strings to null
    const cleanedData = {
      ...data,
      url: data.url || null,
      image_url: data.image_url || null,
      gig_id: data.gig_id || null,
    };

    const { data: item, error } = await supabase
      .from("portfolio_items")
      .insert({
        user_id: user.id,
        ...cleanedData,
      })
      .select(
        `
        *,
        gig:gigs!gig_id (
          id,
          title
        )
      `
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Track reputation for portfolio addition
    const userDid = await getUserDid(supabase, user.id);
    if (userDid) {
      onPortfolioAdded(userDid, item.id);
    }

    return NextResponse.json({ portfolio_item: item }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
