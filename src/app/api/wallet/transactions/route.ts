import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserLnWallet } from "@/lib/lightning/wallet-utils";

const LNBITS_URL = process.env.LNBITS_URL || "https://ln.coinpayportal.com";

function parseLimit(value: string | null) {
  const parsed = Number(value && value.trim() !== "" ? value : 50);
  const finiteValue = Number.isFinite(parsed) ? parsed : 50;
  return Math.min(Math.max(Math.trunc(finiteValue), 1), 100);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"));

    const admin = createServiceClient();
    const lnWallet = await getUserLnWallet(admin, auth.user.id);

    if (!lnWallet) {
      return NextResponse.json({ transactions: [], total: 0 });
    }

    // Fetch transactions directly from LNbits (source of truth)
    const res = await fetch(`${LNBITS_URL}/api/v1/payments?limit=${limit}`, {
      headers: { "X-Api-Key": lnWallet.invoice_key },
    });

    if (!res.ok) {
      return NextResponse.json({ transactions: [], total: 0 });
    }

    const payments = await res.json();
    const transactions = (Array.isArray(payments) ? payments : [])
      .filter((p: any) => p.status === "success")
      .map((p: any) => ({
        id: p.payment_hash,
        amount_sats: Math.floor((p.amount || 0) / 1000),
        fee_sats: Math.floor(Math.abs(p.fee || 0) / 1000),
        memo: p.memo || "",
        status: p.status,
        created_at: p.time || p.created_at,
        type: (p.amount || 0) > 0 ? "incoming" : "outgoing",
      }));

    return NextResponse.json({ transactions, total: transactions.length });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
