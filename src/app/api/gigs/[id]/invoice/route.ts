import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, getAuthContext } from "@/lib/auth/get-user";
import { getConnectedCoinpayAccessToken } from "@/lib/coinpay-oauth";
import {
  findCoinpayGlobalWallet,
  getCoinpayGlobalWalletTokens,
  preferredCoinToPaymentCurrency,
} from "@/lib/coinpayportal";
import { invoiceReceivedEmail, sendEmail } from "@/lib/email";
import { z } from "zod";

const lineItemSchema = z.object({
  description: z.string().max(500).optional().default(""),
  amount: z.number().positive("Line item amount must be positive"),
});

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
        items:gig_invoice_items(id, description, amount_usd, position)
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
    } = validationResult.data;

    // The total (amount_usd) is the authoritative amount CoinPay charges.
    const lineItems = items ?? [];
    const total =
      lineItems.length > 0
        ? Math.round(lineItems.reduce((sum, it) => sum + it.amount, 0) * 100) /
          100
        : (amount as number);

    // Get gig
    const { data: gig } = await supabase
      .from("gigs")
      .select("id, title, poster_id, payment_coin")
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

    const workerId = application.applicant_id;
    const posterId = gig.poster_id;

    const { data: openInvoices } = await (supabase as any)
      .from("gig_invoices")
      .select("id, coinpay_invoice_id, pay_url, status, metadata")
      .eq("application_id", application_id)
      .in("status", ["draft", "sent", "expired"])
      .order("created_at", { ascending: false })
      .limit(1);

    const openInvoice = openInvoices?.[0] || null;
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
        amount_usd: it.amount,
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
            amount_usd: it.amount,
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
