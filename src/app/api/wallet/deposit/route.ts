import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserLnWallet, createInvoice, getLnBalance } from "@/lib/lightning/wallet-utils";

type DepositRequestBody = {
  amount_sats?: unknown;
};

async function parseDepositRequestBody(request: NextRequest): Promise<DepositRequestBody | null> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }
    return body as DepositRequestBody;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await parseDepositRequestBody(request);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { amount_sats } = body;
    if (
      typeof amount_sats !== "number" ||
      !Number.isInteger(amount_sats) ||
      amount_sats <= 0 ||
      amount_sats > 1000000
    ) {
      return NextResponse.json({ error: "Invalid amount (1-1,000,000 sats)" }, { status: 400 });
    }

    const admin = createServiceClient();
    const userId = auth.user.id;

    // Look up user's LNbits wallet — deposits go to THEIR wallet
    const lnWallet = await getUserLnWallet(admin, userId);
    if (!lnWallet) {
      return NextResponse.json(
        { error: "No Lightning wallet found. Please contact support." },
        { status: 400 },
      );
    }

    // Create invoice on the USER's wallet
    const { payment_request, payment_hash } = await createInvoice(
      lnWallet.invoice_key,
      amount_sats,
      `ugig.net deposit (${userId.slice(0, 8)})`,
    );

    // Get current balance for the transaction log
    const currentBalance = await getLnBalance(lnWallet.invoice_key);

    // Ensure Supabase wallet row exists
    const { data: wallet } = (await admin
      .from("wallets" as any)
      .select("id, balance_sats")
      .eq("user_id", userId)
      .single()) as any;

    if (!wallet) {
      await admin.from("wallets" as any).insert({ user_id: userId, balance_sats: currentBalance });
    }

    // Log the pending deposit
    await admin.from("wallet_transactions" as any).insert({
      user_id: userId,
      type: "deposit",
      amount_sats,
      balance_after: currentBalance,
      bolt11: payment_request,
      payment_hash,
      status: "pending",
    });

    return NextResponse.json({ ok: true, payment_request, payment_hash, amount_sats });
  } catch (err) {
    console.error("Deposit error:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
