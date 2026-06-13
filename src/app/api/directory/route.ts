import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, createServiceClient } from "@/lib/auth/get-user";
import {
  DIRECTORY_LISTING_FEE_SATS,
  PLATFORM_WALLET_USER_ID,
} from "@/lib/constants";
import {
  getUserLnWallet,
  getLnBalance,
  internalTransfer,
  syncBalanceCache,
} from "@/lib/lightning/wallet-utils";
import {
  escapePostgrestSearchValue,
  sanitizeSearchParams,
} from "@/lib/security/sanitize";

const LNBITS_INVOICE_KEY = process.env.LNBITS_INVOICE_KEY || "";
const MAX_DIRECTORY_PAGE = 10_000;

const createListingSchema = z.object({
  title: z.string().min(1).max(100),
  url: z.string().url(),
  description: z.string().max(500).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  logo_url: z.string().url().optional(),
  banner_url: z.string().url().optional(),
  screenshot_url: z.string().url().optional(),
});

/**
 * GET /api/directory - Public listing of active projects
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const search = sanitizeSearchParams(url, "search");
    const tag = sanitizeSearchParams(url, "tag");
    const parsedPage = parseInt(url.searchParams.get("page") || "1", 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0
      ? Math.min(parsedPage, MAX_DIRECTORY_PAGE)
      : 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    const supabase = await createClient();

    let query = supabase
      .from("project_listings" as any)
      .select(
        `*, user:profiles!user_id (id, username, full_name, avatar_url)`,
        { count: "exact" }
      )
      .eq("status", "active");

    if (search) {
      const safeSearch = escapePostgrestSearchValue(search);
      query = query.or(
        `title.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%`
      );
    }

    if (tag) {
      const tags = tag.split(",").map((t) => t.trim());
      query = query.overlaps("tags", tags);
    }

    query = query.order("created_at", { ascending: false });
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
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/directory - Create a new project listing (costs 500 sats)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await request.json();
    const parsed = createListingSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { title, url, description, tags, logo_url, banner_url, screenshot_url } = parsed.data;
    const userId = auth.user.id;
    const admin = createServiceClient();

    // Get sender wallet
    const senderWallet = await getUserLnWallet(admin, userId);
    if (!senderWallet) {
      return NextResponse.json(
        { error: "No Lightning wallet found. Deposit sats first." },
        { status: 400 }
      );
    }

    // Check balance
    const balance = await getLnBalance(senderWallet.invoice_key);
    if (balance < DIRECTORY_LISTING_FEE_SATS) {
      return NextResponse.json(
        {
          error: `Insufficient balance. You need ${DIRECTORY_LISTING_FEE_SATS} sats but have ${balance}.`,
          balance_sats: balance,
        },
        { status: 402 }
      );
    }

    // Get platform wallet
    const platformWallet = await getUserLnWallet(admin, PLATFORM_WALLET_USER_ID);
    if (!platformWallet) {
      return NextResponse.json(
        { error: "Platform wallet unavailable" },
        { status: 502 }
      );
    }

    // Transfer fee to platform
    try {
      await internalTransfer(
        senderWallet.admin_key,
        platformWallet.invoice_key,
        DIRECTORY_LISTING_FEE_SATS,
        "ugig.net directory listing fee"
      );
    } catch (err: any) {
      const msg = err?.message?.toLowerCase() || "";
      if (
        msg.includes("insufficient") ||
        msg.includes("balance") ||
        msg.includes("enough")
      ) {
        const currentBalance = await getLnBalance(
          senderWallet.invoice_key
        ).catch(() => 0);
        return NextResponse.json(
          { error: "Insufficient balance", balance_sats: currentBalance },
          { status: 402 }
        );
      }
      return NextResponse.json(
        { error: "Payment failed" },
        { status: 502 }
      );
    }

    // Settle balances
    await new Promise((r) => setTimeout(r, 500));
    const newSenderBalance = await getLnBalance(senderWallet.invoice_key);
    const newPlatformBalance = await getLnBalance(platformWallet.invoice_key);
    await syncBalanceCache(admin, userId, newSenderBalance);
    await syncBalanceCache(admin, PLATFORM_WALLET_USER_ID, newPlatformBalance);

    // Record zap
    const { data: zap } = await admin
      .from("zaps" as any)
      .insert({
        sender_id: userId,
        recipient_id: PLATFORM_WALLET_USER_ID,
        amount_sats: DIRECTORY_LISTING_FEE_SATS,
        fee_sats: 0,
        target_type: "directory_listing",
        target_id: "00000000-0000-0000-0000-000000000000", // placeholder, updated after insert
        note: `Directory listing: ${title}`,
      })
      .select()
      .single();

    const zapId = (zap as any)?.id;

    // Record wallet transactions
    await admin.from("wallet_transactions" as any).insert([
      {
        user_id: userId,
        type: "zap_sent",
        amount_sats: DIRECTORY_LISTING_FEE_SATS,
        balance_after: newSenderBalance,
        reference_id: zapId,
        status: "completed",
      },
      {
        user_id: PLATFORM_WALLET_USER_ID,
        type: "zap_received",
        amount_sats: DIRECTORY_LISTING_FEE_SATS,
        balance_after: newPlatformBalance,
        reference_id: zapId,
        status: "completed",
      },
    ]);

    // Create the listing
    const { data: listing, error: insertError } = await admin
      .from("project_listings" as any)
      .insert({
        user_id: userId,
        title,
        url,
        description: description || null,
        tags: tags || [],
        logo_url: logo_url || null,
        banner_url: banner_url || null,
        screenshot_url: screenshot_url || null,
        zap_tx_id: zapId,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    // Update zap target_id to point to the listing
    if (zapId && (listing as any)?.id) {
      await admin
        .from("zaps" as any)
        .update({ target_id: (listing as any).id })
        .eq("id", zapId);
    }

    return NextResponse.json({ listing }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
