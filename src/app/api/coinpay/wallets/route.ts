import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { getCoinpayLink } from "@/lib/coinpay-oauth";

const SETUP_INSTRUCTIONS = [
  "Connect your CoinPay account from OAuth Connections.",
  "Open CoinPayPortal and create or unlock your web wallet.",
  "Copy the receiving address for each coin you want to use.",
  "Paste those addresses into Settings > Global Wallet Addresses in CoinPay.",
  "Back on ugig, click Reconnect in Settings > Connections: ugig saves your addresses when you connect.",
];

/**
 * GET /api/coinpay/wallets — the caller's CoinPay global wallets as saved at
 * their last CoinPay connect. ugig keeps no CoinPay token, so this never calls
 * CoinPay; reconnecting re-syncs the list (`synced_at`).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const link = await getCoinpayLink(auth.user.id);
    if (!link.wallets) {
      return NextResponse.json({
        data: {
          wallets: [],
          oauth_required: !link.temporary,
          setup_required: true,
          setup_instructions: SETUP_INSTRUCTIONS,
          ...(link.temporary ? { temporarily_unavailable: true } : {}),
        },
      });
    }

    const wallets = link.wallets;
    return NextResponse.json({
      data: {
        wallets,
        synced_at: link.syncedAt ?? null,
        oauth_required: false,
        setup_required: wallets.length === 0,
        setup_instructions: wallets.length === 0 ? SETUP_INSTRUCTIONS : [],
      },
    });
  } catch (err) {
    console.error("[coinpay wallets] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load CoinPay wallets" },
      { status: 500 }
    );
  }
}
