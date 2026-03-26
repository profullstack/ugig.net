import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const SYSTEM_WALLET_USER = "00000000-0000-0000-0000-000000000000";

export async function GET() {
  try {
    const supabase = createServiceClient();

    // Total sats across ALL user wallets (excluding system wallet)
    const { data: allWallets } = await supabase
      .from("wallets" as any)
      .select("balance_sats")
      .neq("user_id", SYSTEM_WALLET_USER);

    const totalSats = (allWallets as any[])?.reduce(
      (sum: number, w: any) => sum + (w.balance_sats || 0),
      0
    ) ?? 0;

    // Platform commission: sum completed zap fees from wallet_transactions
    // (more accurate than LNbits wallet balance which can get out of sync)
    const { data: feeTxns } = await supabase
      .from("wallet_transactions" as any)
      .select("amount_sats")
      .eq("user_id", SYSTEM_WALLET_USER)
      .eq("type", "zap_fee")
      .eq("status", "completed");

    const commissionSats = (feeTxns as any[])?.reduce(
      (sum: number, t: any) => sum + (t.amount_sats || 0),
      0
    ) ?? 0;

    // Fall back to wallet balance if no fee transactions yet
    let finalCommission = commissionSats;
    if (finalCommission === 0) {
      const { data: wallet } = await supabase
        .from("wallets" as any)
        .select("balance_sats")
        .eq("user_id", SYSTEM_WALLET_USER)
        .single();
      finalCommission = (wallet as any)?.balance_sats ?? 0;
    }

    return NextResponse.json({
      balance_sats: totalSats,
      commission_sats: finalCommission,
    });
  } catch {
    return NextResponse.json({ balance_sats: 0, commission_sats: 0 });
  }
}
