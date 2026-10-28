import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createPayment } from "@/lib/coinpayportal";
import { getCoinpayLink } from "@/lib/coinpay-oauth";
import { bountyPayoutCoin, bountyPayoutReadiness, pickBountyPayoutWallet } from "@/lib/bounty-payout";

// POST /api/bounties/[id]/submissions/[sid]/pay
// Creator generates a CoinPay in-app payment for an approved submission.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  try {
    const { id: bountyId, sid } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const { data: bounty } = await (supabase as any)
      .from("bounties")
      .select("id, creator_id, title, payout_usd, payment_coin")
      .eq("id", bountyId)
      .single();
    if (!bounty) {
      return NextResponse.json({ error: "Bounty not found" }, { status: 404 });
    }
    if (bounty.creator_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: submission, error: submissionError } = await (supabase as any)
      .from("bounty_submissions")
      .select("id, submitter_id, status, payout_status, pay_url, coinpay_invoice_id, metadata")
      .eq("id", sid)
      .eq("bounty_id", bountyId)
      .single();
    if (submissionError) {
      console.error("[bounty pay] failed to load submission:", submissionError);
      return NextResponse.json(
        { error: submissionError.message || "Failed to load submission" },
        { status: 400 }
      );
    }
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }
    if (submission.status !== "approved") {
      return NextResponse.json({ error: "Only approved submissions can be paid" }, { status: 400 });
    }

    const metadata = (submission.metadata || {}) as Record<string, unknown>;
    if (submission.payout_status === "paid") {
      return NextResponse.json(
        { error: "Submission has already been paid" },
        { status: 400 }
      );
    }

    if (submission.coinpay_invoice_id && metadata.payment_address) {
      return NextResponse.json({
        data: {
          submission_id: sid,
          coinpay_invoice_id: submission.coinpay_invoice_id,
          pay_url: null,
          checkout_url: metadata.checkout_url || null,
          payment_address: metadata.payment_address || null,
          payment_currency: metadata.payment_currency || null,
          amount_crypto: metadata.amount_crypto || null,
          expires_at: metadata.expires_at || null,
        },
      });
    }

    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";
    const businessId = process.env.COINPAY_MERCHANT_ID;
    const coin = bountyPayoutCoin(bounty.payment_coin);
    if (coin.kind === "unsupported") {
      return NextResponse.json(
        {
          error: `Unsupported bounty payment coin: ${coin.coin}. Pay it to the winner directly, outside ugig.`,
          code: "unsupported_payment_coin",
        },
        { status: 400 }
      );
    }

    // The submitter's own wallet: a live CoinPay link, or the validated payout
    // wallets on their profile (an API-key agent has no browser to link
    // CoinPay with). See src/lib/bounty-payout.ts for the order.
    const submitterLink = await getCoinpayLink(submission.submitter_id);
    const { data: submitterProfile } = await (supabase as any)
      .from("profiles")
      .select("wallet_addresses")
      .eq("id", submission.submitter_id)
      .single();
    const payoutWallet = pickBountyPayoutWallet({
      coin,
      linkWallets: submitterLink.wallets,
      profileWalletAddresses: submitterProfile?.wallet_addresses,
    });

    if (!payoutWallet) {
      const readiness = bountyPayoutReadiness({
        paymentCoin: bounty.payment_coin,
        linkWallets: submitterLink.wallets,
        profileWalletAddresses: submitterProfile?.wallet_addresses,
      });
      // Tell the winner exactly what to do; otherwise an agent waits forever
      // on "approved, awaiting payment" without knowing it is the blocker.
      try {
        await (supabase as any).from("notifications").insert({
          user_id: submission.submitter_id,
          type: "payment_received",
          title: "Add a payout wallet to get paid",
          body: `Your submission to "${bounty.title}" was approved, but you have no payout wallet. ${readiness.message}`,
          data: { bounty_id: bountyId, submission_id: sid, api_fix: readiness.api_fix ?? null },
        });
      } catch (notifyErr) {
        console.error("[bounty pay] could not notify submitter:", notifyErr);
      }
      return NextResponse.json(
        {
          error:
            "The bounty winner has no payout wallet yet. They have been notified; they can add one with their API key (PUT /api/profile/wallet-addresses) or connect CoinPay.",
          code: "payout_wallet_missing",
          setup_required: true,
          api_fix: readiness.api_fix,
        },
        { status: 409 }
      );
    }

    const paymentCurrency = payoutWallet.currency;
    const paymentResult = await createPayment({
      amount_usd: Number(bounty.payout_usd),
      currency: paymentCurrency,
      description: `Bounty payout: ${bounty.title}`,
      business_id: businessId,
      merchant_wallet_address: payoutWallet.address,
      redirect_url: `${appUrl}/bounties/${bountyId}?paid=${sid}`,
      metadata: {
        type: "bounty_payout",
        bounty_id: bountyId,
        submission_id: sid,
        creator_id: user.id,
        submitter_id: submission.submitter_id,
        payment_currency: paymentCurrency,
        merchant_wallet_address: payoutWallet.address,
        merchant_wallet_label: payoutWallet.label || null,
        receiver_wallet_source: payoutWallet.source,
        platform: "ugig.net",
      },
    });

    const cpPayment = (paymentResult.payment || paymentResult) as Record<string, unknown>;
    const paymentId = paymentResult.payment_id || (cpPayment.id as string | undefined);
    const paymentAddress =
      (cpPayment.payment_address as string | undefined) || paymentResult.address || null;
    const checkoutUrl =
      paymentResult.checkout_url || (cpPayment.checkout_url as string | undefined) || null;
    const amountCrypto =
      paymentResult.amount_crypto ||
      (cpPayment.amount_crypto as number | undefined) ||
      (cpPayment.crypto_amount as number | undefined) ||
      null;
    const expiresAt =
      paymentResult.expires_at || (cpPayment.expires_at as string | undefined) || null;
    const responseCurrency =
      paymentResult.currency || (cpPayment.currency as string | undefined) || paymentCurrency;
    const existingMetadata =
      submission.metadata && typeof submission.metadata === "object" && !Array.isArray(submission.metadata)
        ? (submission.metadata as Record<string, unknown>)
        : {};

    if (!paymentId || !paymentAddress) {
      return NextResponse.json(
        { error: "CoinPay did not return a usable payment" },
        { status: 502 }
      );
    }

    const { error: updateError } = await (supabase as any)
      .from("bounty_submissions")
      .update({
        payout_status: "invoiced",
        coinpay_invoice_id: paymentId,
        pay_url: null,
        metadata: {
          ...existingMetadata,
          payment_address: paymentAddress,
          amount_crypto: amountCrypto,
          payment_currency: responseCurrency,
          merchant_wallet_address: payoutWallet.address,
          merchant_wallet_label: payoutWallet.label || null,
          checkout_url: checkoutUrl,
          expires_at: expiresAt,
        },
      })
      .eq("id", sid);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({
      data: {
        submission_id: sid,
        coinpay_invoice_id: paymentId,
        payment_address: paymentAddress,
        payment_currency: responseCurrency,
        amount_crypto: amountCrypto,
        expires_at: expiresAt,
        pay_url: null,
        checkout_url: checkoutUrl,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
