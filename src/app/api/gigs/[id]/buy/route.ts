import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import {
  createEscrow,
  createPaypalPayment,
  findCoinpayGlobalWallet,
  validateCoinpayReceivingAddress,
  type SupportedCurrency,
} from "@/lib/coinpayportal";
import {
  BUY_NOW_CURRENCIES,
  BUY_NOW_FEE_PERCENT,
  BUYABLE_GIG_COLUMNS,
  ORDER_ESCROW_HOURS,
  buyNowBlocker,
  currencyLabel,
  listingPriceUsd,
  notifyOrderParty,
  orderFeeUsd,
  sellerEscrowWallets,
  sellerNotReadyMessage,
  ownerNotReadyMessage,
  ownerApiFix,
  paypalBuyNowEnabled,
  pickPayoutWallet,
  type BuyableGig,
} from "@/lib/orders/buy-now";

const cryptoBuySchema = z.object({
  method: z.literal("crypto").optional(),
  currency: z.enum(BUY_NOW_CURRENCIES as [SupportedCurrency, ...SupportedCurrency[]]),
  refund_address: z.string().trim().min(10, "Enter the wallet address a refund should go to"),
  requirements: z.string().trim().max(5000).optional(),
});

const paypalBuySchema = z.object({
  method: z.literal("paypal"),
  requirements: z.string().trim().max(5000).optional(),
});

async function loadGig(gigId: string): Promise<BuyableGig | null> {
  const { data } = await createServiceClient()
    .from("gigs")
    .select(BUYABLE_GIG_COLUMNS)
    .eq("id", gigId)
    .single();
  return (data as BuyableGig | null) ?? null;
}

// GET /api/gigs/[id]/buy — can this listing be bought, for how much, in which coins
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: gigId } = await params;
  const auth = await getAuthContext(request);
  const gig = await loadGig(gigId);
  if (!gig) return NextResponse.json({ error: "Gig not found" }, { status: 404 });

  // The seller looking at their own listing gets told whether buyers can use
  // Buy now on it, and what to fix if not.
  if (auth && auth.user.id === gig.poster_id) {
    const listingBlocker = buyNowBlocker(gig, null);
    if (listingBlocker) {
      return NextResponse.json({ buyable: false, owner: true, seller_ready: false, reason: listingBlocker });
    }
    const own = await sellerEscrowWallets(gig.poster_id);
    return NextResponse.json({
      buyable: false,
      owner: true,
      seller_ready: own.ok,
      fee_percent: BUY_NOW_FEE_PERCENT,
      ...(own.ok
        ? { payout_source: own.source, currencies: own.wallets.map((w) => w.currency) }
        : { reason: ownerNotReadyMessage(own.reason), fix: own.reason, api_fix: ownerApiFix() }),
    });
  }

  const blocker = buyNowBlocker(gig, auth?.user.id ?? null);
  if (blocker) return NextResponse.json({ buyable: false, reason: blocker });

  const price = await listingPriceUsd(gig);
  if (!price.ok) return NextResponse.json({ buyable: false, reason: price.error });

  const seller = await sellerEscrowWallets(gig.poster_id);
  if (!seller.ok) {
    return NextResponse.json({ buyable: false, reason: sellerNotReadyMessage(seller.reason) });
  }

  const currencies = [...new Set(seller.wallets.map((w) => w.currency))];
  return NextResponse.json({
    buyable: true,
    amount_usd: price.usd,
    native_amount: price.nativeAmount,
    native_unit: price.nativeUnit,
    fee_percent: BUY_NOW_FEE_PERCENT,
    escrow_days: ORDER_ESCROW_HOURS / 24,
    currencies: currencies.map((c) => ({ value: c, label: currencyLabel(c) })),
    paypal: paypalBuyNowEnabled(),
  });
}

// POST /api/gigs/[id]/buy — open an escrowed order for this listing
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gigId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const buyerId = auth.user.id;

    const body = await request.json().catch(() => ({}));
    if (body?.method === "paypal") return buyWithPaypal(request, gigId, buyerId, body);

    const parsed = cryptoBuySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { currency, refund_address, requirements } = parsed.data;

    if (!validateCoinpayReceivingAddress(currency, refund_address)) {
      return NextResponse.json(
        { error: `That is not a valid ${currencyLabel(currency)} address for a refund` },
        { status: 400 }
      );
    }

    const gig = await loadGig(gigId);
    if (!gig) return NextResponse.json({ error: "Gig not found" }, { status: 404 });

    const blocker = buyNowBlocker(gig, buyerId);
    if (blocker) return NextResponse.json({ error: blocker }, { status: 400 });

    const price = await listingPriceUsd(gig);
    if (!price.ok) return NextResponse.json({ error: price.error }, { status: price.status });

    const seller = await sellerEscrowWallets(gig.poster_id);
    if (!seller.ok) {
      return NextResponse.json({ error: sellerNotReadyMessage(seller.reason) }, { status: 409 });
    }
    const sellerWallet = seller.wallets.find((w) => w.currency === currency);
    if (!sellerWallet || !findCoinpayGlobalWallet(seller.wallets, currency, sellerWallet.address)) {
      return NextResponse.json(
        { error: `The seller can't receive ${currencyLabel(currency)}. Pick another coin.` },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // One open order per buyer per listing: a second click should land on the
    // first escrow, not mint another address to pay.
    const { data: open } = await supabase
      .from("gig_orders" as never)
      .select("id")
      .eq("gig_id", gigId)
      .eq("buyer_id", buyerId)
      .eq("status", "pending_payment")
      .limit(1);
    if (Array.isArray(open) && open.length > 0) {
      return NextResponse.json(
        { error: "You already have an unpaid order for this listing", order_id: (open[0] as { id: string }).id },
        { status: 409 }
      );
    }

    const result = (await createEscrow({
      amount_usd: price.usd,
      currency,
      depositor_address: refund_address,
      beneficiary_address: sellerWallet.address,
      description: `ugig order: ${gig.title}`.slice(0, 200),
      marketplace_fee_percent: BUY_NOW_FEE_PERCENT,
      allow_auto_release: true,
      expires_in_hours: ORDER_ESCROW_HOURS,
      metadata: { kind: "gig_order", gig_id: gigId, buyer_id: buyerId, seller_id: gig.poster_id },
    })) as unknown as Record<string, unknown>;

    // CoinPay returns the escrow at the top level; older shapes nested it.
    const escrow = ((result.escrow as Record<string, unknown>) ?? result) as Record<string, unknown>;
    const escrowId = escrow.id as string | undefined;
    const releaseToken = (escrow.release_token ?? result.release_token) as string | undefined;
    const escrowAddress = (escrow.escrow_address ?? escrow.payment_address ?? null) as string | null;

    if (!escrowId || !releaseToken || !escrowAddress) {
      console.error("[buy-now] CoinPay escrow response missing id/token/address", Object.keys(escrow));
      return NextResponse.json({ error: "Payment provider returned an incomplete escrow" }, { status: 502 });
    }

    const { data: order, error } = await supabase
      .from("gig_orders" as never)
      .insert({
        gig_id: gigId,
        buyer_id: buyerId,
        seller_id: gig.poster_id,
        amount_usd: price.usd,
        currency,
        platform_fee_rate: BUY_NOW_FEE_PERCENT / 100,
        platform_fee_usd: orderFeeUsd(price.usd),
        requirements: requirements || null,
        coinpay_escrow_id: escrowId,
        escrow_address: escrowAddress,
        amount_crypto: (escrow.amount as number | undefined) ?? null,
        buyer_refund_address: refund_address,
        seller_payout_address: sellerWallet.address,
        coinpay_release_token: releaseToken,
        expires_at: (escrow.expires_at as string | undefined) ?? null,
        metadata: {
          native_amount: price.nativeAmount,
          native_unit: price.nativeUnit,
          ...(price.btcUsd ? { btc_usd_rate: price.btcUsd } : {}),
        },
      } as never)
      .select("id, status, amount_usd, currency, amount_crypto, escrow_address, expires_at")
      .single();

    if (error || !order) {
      // The escrow exists but nothing points at it. It expires unfunded on its
      // own; log loudly so it can be matched by hand if someone pays it anyway.
      console.error(`[buy-now] escrow ${escrowId} created but order insert failed:`, error);
      return NextResponse.json({ error: "Failed to record the order" }, { status: 500 });
    }

    await notifyOrderParty(
      supabase,
      gig.poster_id,
      "gig_update",
      "New order started",
      `Someone started an order for "${gig.title}" ($${price.usd}). You'll be notified when it's paid.`,
      { gig_id: gigId, order_id: (order as { id: string }).id }
    );

    // Built field by field so the release token can never ride along.
    const o = order as Record<string, unknown>;
    return NextResponse.json(
      {
        order: {
          id: o.id,
          status: o.status,
          amount_usd: o.amount_usd,
          currency: o.currency,
          amount_crypto: o.amount_crypto,
          escrow_address: o.escrow_address,
          expires_at: o.expires_at,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[buy-now] create failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create order" },
      { status: 500 }
    );
  }
}

/**
 * PayPal: the price captures into ugig's own PayPal (CoinPay cannot escrow it).
 * ugig holds it and pays the seller's CoinPay wallet on release, so the seller
 * still needs a usable CoinPay wallet, exactly as for crypto.
 */
async function buyWithPaypal(request: NextRequest, gigId: string, buyerId: string, body: unknown) {
  if (!paypalBuyNowEnabled()) {
    return NextResponse.json({ error: "PayPal isn't available yet" }, { status: 400 });
  }
  const parsed = paypalBuySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const gig = await loadGig(gigId);
  if (!gig) return NextResponse.json({ error: "Gig not found" }, { status: 404 });
  const blocker = buyNowBlocker(gig, buyerId);
  if (blocker) return NextResponse.json({ error: blocker }, { status: 400 });

  const price = await listingPriceUsd(gig);
  if (!price.ok) return NextResponse.json({ error: price.error }, { status: price.status });

  const seller = await sellerEscrowWallets(gig.poster_id);
  if (!seller.ok) {
    return NextResponse.json({ error: sellerNotReadyMessage(seller.reason) }, { status: 409 });
  }
  const payout = pickPayoutWallet(seller.wallets);

  const supabase = createServiceClient();
  const { data: inserted, error } = await supabase
    .from("gig_orders" as never)
    .insert({
      gig_id: gigId,
      buyer_id: buyerId,
      seller_id: gig.poster_id,
      payment_rail: "paypal",
      amount_usd: price.usd,
      currency: "paypal",
      platform_fee_rate: BUY_NOW_FEE_PERCENT / 100,
      platform_fee_usd: orderFeeUsd(price.usd),
      requirements: parsed.data.requirements || null,
      seller_payout_address: payout.address,
      payout_currency: payout.currency,
      metadata: {
        native_amount: price.nativeAmount,
        native_unit: price.nativeUnit,
        ...(price.btcUsd ? { btc_usd_rate: price.btcUsd } : {}),
      },
    } as never)
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("[buy-now] paypal order insert failed:", error);
    return NextResponse.json({ error: "Failed to record the order" }, { status: 500 });
  }
  const orderId = (inserted as { id: string }).id;

  const origin = request.nextUrl?.origin && !request.nextUrl.origin.includes("localhost")
    ? request.nextUrl.origin
    : process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";

  let checkout;
  try {
    checkout = await createPaypalPayment({
      amount_usd: price.usd,
      description: `ugig order: ${gig.title}`.slice(0, 120),
      success_url: `${origin}/dashboard/orders?paypal=return&order=${orderId}`,
      cancel_url: `${origin}/gigs/${gigId}?paypal=cancelled`,
      metadata: { kind: "gig_order", order_id: orderId, gig_id: gigId },
    });
  } catch (err) {
    await supabase.from("gig_orders" as never).update({ status: "expired" } as never).eq("id", orderId);
    console.error("[buy-now] paypal checkout failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PayPal checkout failed" },
      { status: 502 }
    );
  }

  await supabase
    .from("gig_orders" as never)
    .update({ paypal_transaction_id: checkout.transaction_id } as never)
    .eq("id", orderId);

  return NextResponse.json(
    { order: { id: orderId, status: "pending_payment", amount_usd: price.usd, currency: "paypal" }, approve_url: checkout.checkout_url, paypal_approve_url: checkout.approve_url },
    { status: 201 }
  );
}
