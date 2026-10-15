import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { walletAddressSchema } from "@/lib/validations";
import { checkPayoutWallet, payoutCurrencyKey, profilePayoutWallets } from "@/lib/profile-payout-wallets";
import { BUY_NOW_CURRENCIES } from "@/lib/orders/buy-now";

/**
 * GET /api/profile/wallet-addresses
 * Returns wallet addresses for the current user and optionally for a worker
 * Query params:
 * - worker_id=uuid (optional)
 * - gig_id=uuid (required when worker_id is provided)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { user, supabase } = auth;
    const { searchParams } = new URL(request.url);
    const workerId = searchParams.get("worker_id");
    const gigId = searchParams.get("gig_id");

    // Get poster (current user) addresses
    const { data: posterProfile } = await supabase
      .from("profiles")
      .select("wallet_addresses")
      .eq("id", user.id)
      .single();

    const posterAddresses = Array.isArray(posterProfile?.wallet_addresses)
      ? posterProfile.wallet_addresses
      : [];

    let workerAddresses: any[] = [];

    if (workerId) {
      if (!gigId) {
        return NextResponse.json(
          { error: "gig_id is required with worker_id" },
          { status: 400 }
        );
      }

      const service = createServiceClient();

      // Security: caller must own the gig
      const { data: gig } = await service
        .from("gigs")
        .select("id, poster_id")
        .eq("id", gigId)
        .single();

      if (!gig || gig.poster_id !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Security: worker must be an applicant on this gig
      const { data: app } = await service
        .from("applications")
        .select("id")
        .eq("gig_id", gigId)
        .eq("applicant_id", workerId)
        .maybeSingle();

      if (!app) {
        return NextResponse.json(
          { error: "Worker is not an applicant for this gig" },
          { status: 404 }
        );
      }

      const { data: workerProfile } = await service
        .from("profiles")
        .select("wallet_addresses")
        .eq("id", workerId)
        .single();

      workerAddresses = Array.isArray(workerProfile?.wallet_addresses)
        ? workerProfile.wallet_addresses
        : [];
    }

    return NextResponse.json({
      poster_addresses: posterAddresses,
      worker_addresses: workerAddresses,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch wallet addresses" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/profile/wallet-addresses
 * Replace the current user's stored wallet addresses.
 * Body: { wallet_addresses: Array<{ currency, address, is_preferred? }> }
 *
 * Used by the CLI to import CoinPay global wallet addresses into the profile
 * so they are visible to gig posters without requiring OAuth lookups.
 *
 * Entries whose currency is an exact CoinPay key (usdc_sol, eth, btc, ...) are
 * payout wallets: Buy now escrow and gig invoices pay them when the account
 * has no usable CoinPay link, which is how an API-key agent becomes payable.
 * Such an entry with an address that is invalid for its chain is refused here
 * rather than stored, because money would be sent to it.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = z.object({
      wallet_addresses: z.array(walletAddressSchema).max(20),
    }).safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid wallet addresses" },
        { status: 400 }
      );
    }

    for (const entry of parsed.data.wallet_addresses) {
      const check = checkPayoutWallet(entry);
      if (!check.ok && check.reason === "invalid_address") {
        return NextResponse.json(
          { error: `"${entry.address}" is not a valid ${payoutCurrencyKey(entry.currency)} address` },
          { status: 400 }
        );
      }
    }

    // Store payout entries under their canonical key and trimmed address, so
    // what is displayed is exactly what would be paid.
    const walletAddresses = parsed.data.wallet_addresses.map((entry) => {
      const check = checkPayoutWallet(entry);
      return check.ok ? { ...entry, currency: check.currency, address: check.address } : entry;
    });

    const { error } = await supabase
      .from("profiles")
      .update({ wallet_addresses: walletAddresses })
      .eq("id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const payout = profilePayoutWallets(walletAddresses);
    const buyNow = payout.filter((w) => BUY_NOW_CURRENCIES.includes(w.currency));
    return NextResponse.json({
      data: {
        wallet_addresses: walletAddresses,
        payout_wallets: payout.map((w) => ({ currency: w.currency, address: w.address })),
        buy_now_ready: buyNow.length > 0,
        buy_now_currencies: buyNow.map((w) => w.currency),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to update wallet addresses" },
      { status: 500 }
    );
  }
}
