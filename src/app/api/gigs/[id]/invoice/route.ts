import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, getAuthContext } from "@/lib/auth/get-user";
import { getConnectedCoinpayAccessToken } from "@/lib/coinpay-oauth";
import {
  findCoinpayGlobalWallet,
  getCoinpayGlobalWalletTokens,
  preferredCoinToPaymentCurrency,
} from "@/lib/coinpayportal";
import { invoiceReceivedEmail, sendEmail } from "@/lib/email";
import { isGitHubPrLink } from "@/lib/github-links";
import { getBtcUsdRate, isSatsCoin, satsToUsd } from "@/lib/rates";
import { z } from "zod";

const githubPrLinkSchema = z
  .string()
  .url("Each PR link must be a valid URL")
  .max(500)
  .refine(isGitHubPrLink, {
    message: "PR links must be GitHub pull request or PR search URLs",
  });

const lineItemSchema = z.object({
  description: z.string().max(500).optional().default(""),
  // quantity + unit_price is the preferred form; amount is the legacy fallback.
  quantity: z.number().positive().optional().default(1),
  unit_price: z.number().positive("Unit price must be positive").optional(),
  amount: z.number().positive("Line item amount must be positive").optional(),
  // Optional GitHub link backing this charge, e.g. the worker's merged PRs:
  // "Pull requests (8 x $1.00)" → github.com/org/repo/pulls?q=is:pr+is:merged+author:user
  link: githubPrLinkSchema.optional(),
}).refine(
  (d) => (d.unit_price != null && d.unit_price > 0) || (d.amount != null && d.amount > 0),
  { message: "Provide either a unit price or an amount for each line item" }
).transform((d) => ({
  description: d.description ?? "",
  quantity: d.quantity ?? 1,
  unit_price: d.unit_price ?? (d.amount ?? 0),
  // amount is quantity × unit_price; fall back to legacy flat amount
  amount: d.unit_price != null ? (d.quantity ?? 1) * d.unit_price : (d.amount ?? 0),
  link: d.link ?? null,
}));

const createInvoiceSchema = z
  .object({
    application_id: z.string().uuid(),
    // Either a single amount (legacy) or itemized line items whose sum is the total.
    amount: z.number().positive("Amount must be positive").optional(),
    items: z.array(lineItemSchema).max(50).optional(),
    currency: z.string().default("USD"),
    payment_currency: z.string().optional(),
    merchant_wallet_address: z.string().optional(),
    notes: z.string().optional(),
    due_date: z.string().optional(),
    // Optional links to the merged GitHub PRs this invoice bills for, so the
    // poster can verify the work without the worker communicating it manually.
    // Accepts individual PR URLs and PR search URLs (merged PRs by author).
    pr_links: z.array(githubPrLinkSchema).max(20).optional(),
  })
  .refine(
    (d) =>
      (d.items && d.items.length > 0) ||
      (typeof d.amount === "number" && d.amount > 0),
    { message: "Add at least one line item or an amount", path: ["items"] }
  );

const COINPAY_WALLET_SETUP_INSTRUCTIONS = [
  "Connect your CoinPay account from OAuth Connections.",
  "Open CoinPayPortal and create or unlock your web wallet.",
  "Copy the receiving address for each coin you want to use.",
  "Paste those addresses into Settings > Global Wallet Addresses in CoinPay, then refresh the invoice form.",
];

// GET /api/gigs/[id]/invoice - Get invoices for a gig
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: gigId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    // Get invoices where user is worker or poster
    const { data: invoices, error } = await (supabase as any)
      .from("gig_invoices")
      .select(
        `
        *,
        worker:profiles!worker_id(id, username, full_name, avatar_url),
        poster:profiles!poster_id(id, username, full_name, avatar_url),
        items:gig_invoice_items(id, description, quantity, unit_price_usd, amount_usd, link, position)
      `
      )
      .eq("gig_id", gigId)
      .or(`worker_id.eq.${user.id},poster_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: invoices || [] });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

// POST /api/gigs/[id]/invoice - Create invoice for an accepted application
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: gigId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const body = await request.json();
    const validationResult = createInvoiceSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const {
      application_id,
      amount,
      items,
      currency,
      payment_currency,
      merchant_wallet_address,
      notes,
      due_date,
      pr_links,
    } = validationResult.data;

    // De-dupe and trim the PR links; an empty array is treated as "none".
    const prLinks = Array.from(
      new Set((pr_links ?? []).map((u) => u.trim()).filter(Boolean))
    );

    // The amounts arriving from the client are in the posting's NATIVE unit:
    // sats for SATS/LN/BTC gigs, USD otherwise. We validate them in that unit,
    // then convert to USD below for amount_usd (the value CoinPay charges).
    const lineItems = items ?? [];
    const nativeTotal =
      lineItems.length > 0
        ? Math.round(lineItems.reduce((sum, it) => sum + it.amount, 0) * 100) /
          100
        : (amount as number);

    // Get gig — need budget fields to cap the invoice to the agreed amount.
    const { data: gig } = await supabase
      .from("gigs")
      .select("id, title, poster_id, payment_coin, budget_type, budget_min, budget_max")
      .eq("id", gigId)
      .single();

    if (!gig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    // Get application — must be accepted; the user must be either the worker
    // (self-billing) or the gig poster (paying the worker directly).
    const { data: application } = await supabase
      .from("applications")
      .select("id, applicant_id, status, proposed_rate")
      .eq("id", application_id)
      .eq("gig_id", gigId)
      .single();

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const isWorker = application.applicant_id === user.id;
    const isPoster = gig.poster_id === user.id;

    if (!isWorker && !isPoster) {
      return NextResponse.json(
        { error: "Only the worker or gig poster can create an invoice" },
        { status: 403 }
      );
    }

    if (application.status !== "accepted") {
      return NextResponse.json(
        { error: "Application must be accepted before creating an invoice" },
        { status: 400 }
      );
    }

    // Stop made-up amounts: the invoice can't exceed the agreed amount for the
    // posting. The agreed amount is the accepted rate, falling back to the gig's
    // budget. Only enforced for single-payout gigs (fixed and bounty) —
    // hourly/per-task/per-unit totals legitimately exceed the single quoted rate.
    const isSats = isSatsCoin(gig.payment_coin);
    const nativeUnit = isSats ? "sats" : "USD";
    const budgetType = gig.budget_type || "fixed";
    const isSinglePayout = budgetType === "fixed" || budgetType === "bounty";
    const agreedCap =
      application.proposed_rate ?? gig.budget_max ?? gig.budget_min ?? null;
    const fmtNative = (n: number) =>
      isSats ? `${n.toLocaleString()} sats` : `$${n.toFixed(2)}`;

    if (isSinglePayout) {
      // A single-payout gig with no agreed amount anywhere is a hard stop, not
      // an uncapped invoice — otherwise the cap silently doesn't apply.
      if (agreedCap == null) {
        return NextResponse.json(
          {
            error:
              "This gig has no agreed amount yet. Set a budget on the gig or accept a proposed rate before invoicing.",
          },
          { status: 400 }
        );
      }
      if (nativeTotal > agreedCap + 1e-6) {
        return NextResponse.json(
          {
            error: `Invoice total (${fmtNative(nativeTotal)}) exceeds the agreed amount for this gig (${fmtNative(
              agreedCap
            )}).`,
          },
          { status: 400 }
        );
      }
    }

    // Convert the native total to USD — the canonical amount CoinPay charges.
    // For sats gigs this is where "500 sats" becomes its real ~$0.x value
    // instead of being mistaken for $500.
    let btcUsd: number | null = null;
    if (isSats) {
      btcUsd = await getBtcUsdRate();
      if (!btcUsd) {
        return NextResponse.json(
          { error: "Couldn't fetch the current BTC price to price this invoice. Try again shortly." },
          { status: 503 }
        );
      }
    }
    const toUsd = (nativeAmount: number) =>
      isSats ? satsToUsd(nativeAmount, btcUsd as number) : nativeAmount;
    const total = toUsd(nativeTotal);

    // A positive sats amount that rounds to $0.00 would create a free invoice.
    if (nativeTotal > 0 && total <= 0) {
      return NextResponse.json(
        { error: "Invoice amount is too small to charge (rounds to $0.00)." },
        { status: 400 }
      );
    }

    const workerId = application.applicant_id;
    const posterId = gig.poster_id;

    // Retry guard: agents and double-clicks resubmit the same request, so an
    // identical recent open invoice is returned instead of duplicated. It must
    // be a *retry* — same amount, unpaid, and recent. A different amount or an
    // older invoice is a genuinely new invoice ("Send Another Invoice"), which
    // an earlier version of this check swallowed forever.
    const { data: openInvoices } = await (supabase as any)
      .from("gig_invoices")
      .select("id, coinpay_invoice_id, pay_url, status, metadata, amount_usd, created_at")
      .eq("application_id", application_id)
      .in("status", ["draft", "sent"])
      .order("created_at", { ascending: false })
      .limit(1);

    const RETRY_WINDOW_MS = 10 * 60 * 1000;
    const candidate = openInvoices?.[0] || null;
    const candidateMeta =
      candidate?.metadata && typeof candidate.metadata === "object"
        ? (candidate.metadata as Record<string, unknown>)
        : {};
    // Compare in the posting-native unit when recorded (exact — no FX drift
    // between retries on sats gigs); fall back to the USD total.
    const candidateAmount =
      typeof candidateMeta.native_amount === "number"
        ? candidateMeta.native_amount
        : Number(candidate?.amount_usd);
    const requestAmount =
      typeof candidateMeta.native_amount === "number" ? nativeTotal : total;
    const openInvoice =
      candidate &&
      Math.abs(candidateAmount - requestAmount) < 0.005 &&
      Date.now() - new Date(candidate.created_at).getTime() < RETRY_WINDOW_MS
        ? candidate
        : null;
    if (openInvoice) {
      const metadata =
        openInvoice.metadata && typeof openInvoice.metadata === "object"
          ? (openInvoice.metadata as Record<string, unknown>)
          : {};
      return NextResponse.json(
        {
          data: {
            invoice_id: openInvoice.id,
            coinpay_invoice_id: openInvoice.coinpay_invoice_id,
            pay_url: openInvoice.pay_url,
            payment_address: metadata.payment_address || null,
            amount_crypto: metadata.amount_crypto || null,
            payment_currency:
              metadata.payment_currency || metadata.receiver_payment_currency || null,
            expires_at: metadata.expires_at || null,
            metadata: openInvoice.metadata,
          },
        },
        { status: 200 }
      );
    }

    const selectedCurrency = preferredCoinToPaymentCurrency(payment_currency || null);
    const selectedAddress = merchant_wallet_address?.trim() || "";

    if (!selectedCurrency || !selectedAddress) {
      return NextResponse.json(
        { error: "Select a CoinPay receiving wallet before sending the invoice" },
        { status: 400 }
      );
    }

    const workerCoinpayToken = await getConnectedCoinpayAccessToken(workerId);
    if (!workerCoinpayToken) {
      return NextResponse.json(
        {
          error: isWorker
            ? "Connect your CoinPay account before sending an invoice"
            : "The worker must connect CoinPay before this invoice can be created",
          oauth_required: isWorker,
          setup_required: true,
          setup_instructions: COINPAY_WALLET_SETUP_INSTRUCTIONS,
        },
        { status: 409 }
      );
    }

    const workerWallets = await getCoinpayGlobalWalletTokens({ access_token: workerCoinpayToken });
    if (workerWallets.length === 0) {
      return NextResponse.json(
        {
          error: isWorker
            ? "Add CoinPay global wallet addresses before sending an invoice"
            : "The worker must add CoinPay global wallet addresses before this invoice can be created",
          oauth_required: false,
          setup_required: true,
          setup_instructions: COINPAY_WALLET_SETUP_INSTRUCTIONS,
        },
        { status: 409 }
      );
    }

    const selectedWallet = findCoinpayGlobalWallet(
      workerWallets,
      selectedCurrency,
      selectedAddress
    );
    if (!selectedWallet) {
      return NextResponse.json(
        { error: "Selected receiving address is not a valid CoinPay wallet for that coin" },
        { status: 400 }
      );
    }

    const { data: invoice, error } = await (supabase as any)
      .from("gig_invoices")
      .insert({
        gig_id: gigId,
        application_id,
        worker_id: workerId,
        poster_id: posterId,
        coinpay_invoice_id: null,
        amount_usd: total,
        currency,
        status: "sent",
        pay_url: null,
        notes,
        due_date: due_date || null,
        metadata: {
          invoice_currency: currency,
          initiated_by: isPoster ? "poster" : "worker",
          receiver_payment_currency: selectedWallet.currency,
          merchant_wallet_address: selectedWallet.address,
          merchant_wallet_label: selectedWallet.label,
          // Audit trail for the posting-native amount this USD total came from.
          posting_coin: gig.payment_coin || null,
          native_unit: nativeUnit,
          native_amount: nativeTotal,
          ...(isSats ? { btc_usd_rate: btcUsd } : {}),
          ...(prLinks.length > 0 ? { pr_links: prLinks } : {}),
        },
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create invoice record:", error);
      return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
    }

    // Persist line items (if itemized). Uses the service client; the route has
    // already authorized the user as worker/poster for this gig.
    if (lineItems.length > 0) {
      const svc = createServiceClient();
      const rows = lineItems.map((it, idx) => ({
        invoice_id: invoice.id,
        description: (it.description || "").slice(0, 500),
        quantity: it.quantity ?? 1,
        unit_price_usd: toUsd(it.unit_price ?? it.amount),
        amount_usd: toUsd(it.amount),
        link: it.link,
        position: idx,
      }));
      const { error: itemsError } = await (svc as any)
        .from("gig_invoice_items")
        .insert(rows);
      if (itemsError) {
        console.error("Failed to insert invoice items:", itemsError);
      }
    }

    // Notify the counterparty
    const { data: actorProfile } = await supabase
      .from("profiles")
      .select("username, full_name")
      .eq("id", user.id)
      .single();

    const actorName =
      actorProfile?.full_name || actorProfile?.username || (isPoster ? "The client" : "A worker");
    const recipientId = isPoster ? workerId : posterId;
    const notificationBody = isPoster
      ? `${actorName} prepared a $${total} payment for "${gig.title}". Open the invoice to confirm.`
      : `${actorName} sent you a $${total} invoice for "${gig.title}".`;

    await supabase.from("notifications").insert({
      user_id: recipientId,
      type: "payment_received",
      title: isPoster ? "Payment prepared" : "Invoice received",
      body: notificationBody,
      data: {
        gig_id: gigId,
        invoice_id: invoice.id,
      },
    });

    if (!isPoster) {
      try {
        const adminClient = createServiceClient();
        const { data: posterAuth } = await adminClient.auth.admin.getUserById(posterId);
        const posterEmail = posterAuth?.user?.email;

        if (posterEmail) {
          const { data: posterProfile } = await supabase
            .from("profiles")
            .select("username, full_name")
            .eq("id", posterId)
            .single();

          const posterName = posterProfile?.full_name || posterProfile?.username || "there";
          const emailContent = invoiceReceivedEmail({
            posterName,
            workerName: actorName,
            gigTitle: gig.title,
            amountUsd: total,
            invoiceId: invoice.id,
            prLinks,
            items: lineItems.map((it) => ({
              description: it.description,
              quantity: it.quantity,
              unitPriceUsd: toUsd(it.unit_price ?? it.amount),
              amountUsd: toUsd(it.amount),
              link: it.link,
            })),
          });

          await sendEmail({ to: posterEmail, ...emailContent });
        }
      } catch (emailError) {
        console.error("Failed to send invoice notification email:", emailError);
      }
    }

    return NextResponse.json(
      {
        data: {
          invoice_id: invoice.id,
          coinpay_invoice_id: null,
          pay_url: null,
          payment_address: null,
          amount_crypto: null,
          payment_currency: selectedWallet.currency,
          expires_at: null,
          metadata: invoice.metadata,
          items: lineItems.map((it, idx) => ({
            description: it.description ?? "",
            quantity: it.quantity ?? 1,
            unit_price_usd: it.unit_price ?? it.amount,
            amount_usd: it.amount,
            link: it.link,
            position: idx,
          })),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Invoice creation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
