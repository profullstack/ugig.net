import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserLnWallet, getLnBalance, payInvoice, syncBalanceCache } from "@/lib/lightning/wallet-utils";

const LNBITS_URL = process.env.LNBITS_URL || "https://ln.coinpayportal.com";
const MIN_WITHDRAW = 10;
const MAX_WITHDRAW = 100000;
const DAILY_WITHDRAW_LIMIT = 500000;
const HOURLY_WITHDRAW_LIMIT = 3;

type WithdrawRequestBody = {
  amount_sats?: unknown;
  destination?: unknown;
};

async function parseWithdrawRequestBody(request: NextRequest): Promise<WithdrawRequestBody | null> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }
    return body as WithdrawRequestBody;
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

    const body = await parseWithdrawRequestBody(request);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { amount_sats, destination } = body;

    if (!amount_sats || !destination) {
      return NextResponse.json({ error: "amount_sats and destination are required" }, { status: 400 });
    }
    if (typeof amount_sats !== "number" || !Number.isInteger(amount_sats)) {
      return NextResponse.json({ error: "Amount must be a whole number" }, { status: 400 });
    }
    if (typeof destination !== "string") {
      return NextResponse.json({ error: "Destination must be a string" }, { status: 400 });
    }
    if (amount_sats < MIN_WITHDRAW || amount_sats > MAX_WITHDRAW) {
      return NextResponse.json({
        error: `Amount must be between ${MIN_WITHDRAW} and ${MAX_WITHDRAW.toLocaleString()} sats`,
      }, { status: 400 });
    }

    const admin = createServiceClient();
    const userId = auth.user.id;

    // Rate limit: max N withdrawals per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = (await admin
      .from("wallet_transactions" as any)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "withdrawal")
      .gte("created_at", oneHourAgo)) as any;

    if ((recentCount ?? 0) >= HOURLY_WITHDRAW_LIMIT) {
      return NextResponse.json({ error: "Too many withdrawals. Max 3 per hour." }, { status: 429 });
    }

    // Daily limit check
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: dailyTxs } = (await admin
      .from("wallet_transactions" as any)
      .select("amount_sats")
      .eq("user_id", userId)
      .eq("type", "withdrawal")
      .gte("created_at", oneDayAgo)) as any;

    const dailyTotal = (dailyTxs || []).reduce((sum: number, tx: any) => sum + Math.abs(tx.amount_sats), 0);
    if (dailyTotal + amount_sats > DAILY_WITHDRAW_LIMIT) {
      return NextResponse.json({
        error: `Daily withdrawal limit is ${DAILY_WITHDRAW_LIMIT.toLocaleString()} sats. You've used ${dailyTotal.toLocaleString()} today.`,
      }, { status: 400 });
    }

    // Get user's LNbits wallet — withdrawals come from THEIR wallet
    const lnWallet = await getUserLnWallet(admin, userId);
    if (!lnWallet) {
      return NextResponse.json({ error: "No Lightning wallet found" }, { status: 400 });
    }

    // Check real LNbits balance
    const currentBalance = await getLnBalance(lnWallet.invoice_key);
    if (currentBalance < amount_sats) {
      return NextResponse.json({ error: "Insufficient balance", balance_sats: currentBalance }, { status: 400 });
    }

    // Resolve destination and pay from user's wallet
    let paymentHash: string;
    let bolt11: string | null = null;

    try {
      if (destination.startsWith("lnbc") || destination.startsWith("lntb")) {
        bolt11 = destination;
        const result = await payInvoice(lnWallet.admin_key, destination);
        paymentHash = result.payment_hash;

      } else if (destination.includes("@")) {
        const [name, domain] = destination.split("@");
        if (!name || !domain) {
          throw new Error("Invalid Lightning Address");
        }

        // Resolve LNURL
        const lnurlRes = await fetch(`https://${domain}/.well-known/lnurlp/${name}`);
        if (!lnurlRes.ok) throw new Error("Could not resolve Lightning Address");

        const lnurlData = await lnurlRes.json();
        if (!lnurlData.callback) throw new Error("Invalid Lightning Address (no callback)");

        const amountMsats = amount_sats * 1000;
        if (amountMsats < (lnurlData.minSendable || 1000) || amountMsats > (lnurlData.maxSendable || 100000000000)) {
          throw new Error("Amount out of range for this address");
        }

        const sep = lnurlData.callback.includes("?") ? "&" : "?";
        const invoiceRes = await fetch(`${lnurlData.callback}${sep}amount=${amountMsats}`);
        if (!invoiceRes.ok) throw new Error("Failed to get invoice");

        const invoiceData = await invoiceRes.json();
        if (!invoiceData.pr) throw new Error("No invoice returned");

        bolt11 = invoiceData.pr;
        const result = await payInvoice(lnWallet.admin_key, invoiceData.pr);
        paymentHash = result.payment_hash;

      } else {
        throw new Error("Invalid destination");
      }
    } catch (payErr: any) {
      console.error("[Withdraw] Payment failed:", payErr.message);
      const errMsg = payErr.message?.includes("Invalid")
        ? payErr.message
        : "Lightning payment failed. Please try again.";
      return NextResponse.json({ error: errMsg }, { status: 502 });
    }

    // Get updated balance from LNbits
    const newBalance = await getLnBalance(lnWallet.invoice_key);

    // Update Supabase cache
    await syncBalanceCache(admin, userId, newBalance);

    // Record transaction
    await admin.from("wallet_transactions" as any).insert({
      user_id: userId,
      type: "withdrawal",
      amount_sats: -amount_sats,
      balance_after: newBalance,
      bolt11,
      payment_hash: paymentHash,
      status: "completed",
      metadata: { destination },
    });

    return NextResponse.json({
      ok: true,
      amount_sats,
      new_balance: newBalance,
      payment_hash: paymentHash,
      destination,
    });
  } catch (err) {
    console.error("[Withdraw] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
