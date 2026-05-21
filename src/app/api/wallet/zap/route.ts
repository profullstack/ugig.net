import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { PLATFORM_FEE_RATE, PLATFORM_WALLET_USER_ID } from "@/lib/constants";
import { getUserDid, onZapSent, onZapReceived } from "@/lib/reputation-hooks";
import { safeParseBody } from "@/lib/sanitize";
import {
  getUserLnWallet,
  getLnBalance,
  internalTransfer,
  syncBalanceCache,
} from "@/lib/lightning/wallet-utils";

const LNBITS_INVOICE_KEY = process.env.LNBITS_INVOICE_KEY || "";

// Zod schema for zap request validation (#77)
const zapRequestSchema = z.object({
  recipient_id: z.string().uuid(),
  amount_sats: z.number().int().positive().max(1000000, "Maximum zap amount is 1,000,000 sats"),
  target_type: z.enum(["post", "gig", "comment", "profile", "skill", "mcp", "prompt", "directory"]),
  target_id: z.string(),
  note: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await safeParseBody(request);
    if (!rawBody) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = zapRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { recipient_id, amount_sats, target_type, target_id, note } = parsed.data;

    const senderId = auth.user.id;
    if (senderId === recipient_id) {
      return NextResponse.json({ error: "Cannot zap yourself" }, { status: 400 });
    }

    const admin = createServiceClient();

    // Get sender's LNbits wallet
    const senderWallet = await getUserLnWallet(admin, senderId);
    if (!senderWallet) {
      return NextResponse.json({ error: "No Lightning wallet found" }, { status: 400 });
    }

    // Pre-check sender's balance (informational only — authoritative check happens at transfer time)
    const senderBalance = await getLnBalance(senderWallet.invoice_key);
    if (senderBalance < amount_sats) {
      return NextResponse.json({ error: "Insufficient balance", balance_sats: senderBalance }, { status: 400 });
    }

    // Get recipient's LNbits wallet
    const recipientWallet = await getUserLnWallet(admin, recipient_id);
    if (!recipientWallet) {
      return NextResponse.json({ error: "Recipient has no Lightning wallet" }, { status: 400 });
    }

    // Calculate fee
    const fee_sats = Math.floor(amount_sats * PLATFORM_FEE_RATE);
    const recipient_amount = amount_sats - fee_sats;

    // Transfer recipient's share: sender → recipient (instant internal transfer)
    // Handle insufficient-funds errors gracefully (TOCTOU race condition #78)
    try {
      await internalTransfer(
        senderWallet.admin_key,
        recipientWallet.invoice_key,
        recipient_amount,
        `ugig.net zap`,
      );
    } catch (err: any) {
      console.error("[Zap] Transfer to recipient failed:", err);
      const msg = err?.message?.toLowerCase() || "";

      // Insufficient funds
      if (msg.includes("insufficient") || msg.includes("balance") || msg.includes("enough")) {
        const currentBalance = await getLnBalance(senderWallet.invoice_key).catch(() => 0);
        return NextResponse.json({ error: "Insufficient balance", balance_sats: currentBalance }, { status: 400 });
      }

      // Lightning node / backend unavailable
      if (
        msg.includes("voidwallet") ||
        msg.includes("node is down") ||
        msg.includes("connection refused") ||
        msg.includes("network is unreachable") ||
        msg.includes("unreachable") ||
        msg.includes("fetch failed")
      ) {
        return NextResponse.json({
          error: "Lightning network is temporarily unavailable. Please try again later.",
        }, { status: 503 });
      }

      // Payment timeout
      if (msg.includes("timeout") || msg.includes("timed out")) {
        return NextResponse.json({
          error: "Payment timed out. Please try again.",
        }, { status: 504 });
      }

      // Route not found / no path
      if (msg.includes("route") || msg.includes("no path")) {
        return NextResponse.json({
          error: "Could not find a Lightning path to this recipient. Try again later.",
        }, { status: 502 });
      }

      // Generic LNbits error — expose the actual message
      return NextResponse.json({
        error: err?.message || "Zap transfer failed",
      }, { status: 502 });
    }

    // Transfer platform fee: sender → platform wallet (retry up to 3 times)
    if (fee_sats > 0) {
      let feeTransferred = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await internalTransfer(
            senderWallet.admin_key,
            LNBITS_INVOICE_KEY,
            fee_sats,
            `ugig.net zap fee`,
          );
          feeTransferred = true;
          break;
        } catch (err) {
          console.error(`[Zap] Platform fee transfer attempt ${attempt}/3 failed:`, err);
          if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
      if (!feeTransferred) {
        console.error(`[Zap] Platform fee transfer failed after 3 attempts (${fee_sats} sats lost)`);
      }
    }

    // Wait for LNbits internal transfers to settle before querying balances
    await new Promise((r) => setTimeout(r, 500));

    // Get updated balances from LNbits (retry once if balance looks stale)
    let newSenderBalance = await getLnBalance(senderWallet.invoice_key);
    let newRecipientBalance = await getLnBalance(recipientWallet.invoice_key);

    // Sanity check: recipient balance should have increased
    // If LNbits is still stale, wait and retry once
    if (newRecipientBalance === 0 || newRecipientBalance < recipient_amount) {
      await new Promise((r) => setTimeout(r, 1000));
      newSenderBalance = await getLnBalance(senderWallet.invoice_key);
      newRecipientBalance = await getLnBalance(recipientWallet.invoice_key);
    }

    // Sync Supabase caches (sender, recipient, AND platform wallet)
    await syncBalanceCache(admin, senderId, newSenderBalance);
    await syncBalanceCache(admin, recipient_id, newRecipientBalance);

    // Sync platform wallet balance so the footer commission display stays current
    let platformBalanceAfter = 0;
    if (fee_sats > 0) {
      try {
        const platformBalance = await getLnBalance(LNBITS_INVOICE_KEY);
        platformBalanceAfter = platformBalance;
        await syncBalanceCache(admin, PLATFORM_WALLET_USER_ID, platformBalance);
      } catch (err) {
        console.error("[Zap] Platform balance sync failed:", err);
      }
    }

    // Create zap record
    const { data: zap } = await admin
      .from("zaps" as any)
      .insert({
        sender_id: senderId,
        recipient_id,
        amount_sats,
        fee_sats,
        target_type,
        target_id,
        note: note || null,
      })
      .select()
      .single();

    const zapId = (zap as any)?.id;

    const txns: any[] = [
      {
        user_id: senderId,
        type: "zap_sent",
        amount_sats,
        balance_after: newSenderBalance,
        reference_id: zapId,
        status: "completed",
      },
      {
        user_id: recipient_id,
        type: "zap_received",
        amount_sats: recipient_amount,
        balance_after: newRecipientBalance,
        reference_id: zapId,
        status: "completed",
      },
    ];
    if (fee_sats > 0) {
      txns.push({
        user_id: PLATFORM_WALLET_USER_ID,
        type: "zap_fee",
        amount_sats: fee_sats,
        balance_after: platformBalanceAfter,
        reference_id: zapId,
        status: "completed",
      });
    }
    await admin.from("wallet_transactions" as any).insert(txns);

    // Notify recipient
    const { data: recipientProfile } = await admin
      .from("profiles")
      .select("*")
      .eq("id", recipient_id)
      .single();

    const { data: senderProfile } = await admin
      .from("profiles")
      .select("username")
      .eq("id", senderId)
      .single();

    const senderName = senderProfile?.username || "Someone";

    if ((recipientProfile as any)?.ln_address) {
      await (admin.from("notifications") as any).insert({
        user_id: recipient_id,
        type: "zap_received",
        title: "You received a zap! ⚡",
        body: `${senderName} zapped you ${recipient_amount.toLocaleString()} sats`,
        data: { zap_id: zapId, amount_sats: recipient_amount, target_type, target_id },
      });
    } else {
      await (admin.from("notifications") as any).insert({
        user_id: recipient_id,
        type: "zap_received",
        title: "You received a zap! ⚡",
        body: `${senderName} zapped you ${recipient_amount.toLocaleString()} sats. Add a Lightning Address to your profile to withdraw.`,
        data: { zap_id: zapId, amount_sats: recipient_amount, target_type, target_id, action_url: "/profile" },
      });
    }

    // DID reputation
    const senderDid = await getUserDid(admin, senderId);
    const recipientDid = await getUserDid(admin, recipient_id);
    if (senderDid) onZapSent(senderDid, recipientDid || recipient_id, amount_sats);
    if (recipientDid) onZapReceived(recipientDid, senderDid || senderId, recipient_amount);

    return NextResponse.json({ ok: true, zap, new_balance: newSenderBalance, fee_sats });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
