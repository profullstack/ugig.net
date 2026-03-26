import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserLnWallet, getLnBalance, syncBalanceCache } from "@/lib/lightning/wallet-utils";

/**
 * GET /api/wallet - Get wallet info and balance (#16)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createServiceClient();
    const userId = auth.user.id;

    const lnWallet = await getUserLnWallet(admin, userId);
    if (!lnWallet) {
      await syncBalanceCache(admin, userId, 0);
      return NextResponse.json({ balance_sats: 0, has_wallet: false });
    }

    const balance_sats = await getLnBalance(lnWallet.invoice_key);
    await syncBalanceCache(admin, userId, balance_sats);

    return NextResponse.json({ balance_sats, has_wallet: true });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
