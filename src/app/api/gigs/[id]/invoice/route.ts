import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createPayment, resolveSupportedPaymentCurrency } from "@/lib/coinpayportal";
import { z } from "zod";

const createInvoiceSchema = z.object({
  application_id: z.string().uuid(),
  amount: z.number().positive("Amount must be positive"),
  currency: z.string().default("USD"),
  notes: z.string().optional(),
  due_date: z.string().optional(),
});

// GET /api/gigs/[id]/invoice - Get invoices for a gig
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
      .select(`
        *,
        worker:profiles!worker_id(id, username, full_name, avatar_url),
        poster:profiles!poster_id(id, username, full_name, avatar_url)
      `)
      .eq("gig_id", gigId)
      .or(`worker_id.eq.${user.id},poster_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: invoices || [] });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// POST /api/gigs/[id]/invoice - Create invoice for an accepted application
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { application_id, amount, currency, notes, due_date } = validationResult.data;

    // Get gig
    const { data: gig } = await supabase
      .from("gigs")
      .select("id, title, poster_id, payment_coin")
      .eq("id", gigId)
      .single();

    if (!gig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    // Get application — must be accepted, user must be the applicant (worker)
    const { data: application } = await supabase
      .from("applications")
      .select("id, applicant_id, status, proposed_rate")
      .eq("id", application_id)
      .eq("gig_id", gigId)
      .single();

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    if (application.applicant_id !== user.id) {
      return NextResponse.json(
        { error: "Only the accepted worker can create an invoice" },
        { status: 403 }
      );
    }

    if (application.status !== "accepted") {
      return NextResponse.json(
        { error: "Application must be accepted before creating an invoice" },
        { status: 400 }
      );
    }

    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";
    const regularBusinessId =
      process.env.COINPAY_UGIG_BUSINESS_ID ||
      process.env.COINPAY_MERCHANT_ID;
    const paymentCurrency = await resolveSupportedPaymentCurrency(
      (gig as any).payment_coin,
      { business_id: regularBusinessId }
    );

    // Create a direct CoinPay payment request instead of a hosted invoice. The
    // poster should see payment details inside uGig, not be redirected away.
    const paymentResult = await createPayment({
      amount_usd: amount,
      currency: paymentCurrency,
      description: notes || `Invoice for gig: ${gig.title}`,
      business_id: regularBusinessId,
      redirect_url: `${appUrl}/gigs/${gigId}?invoice=paid`,
      metadata: {
        type: "gig_invoice",
        gig_id: gigId,
        application_id,
        worker_id: user.id,
        poster_id: gig.poster_id,
        invoice_currency: currency,
        payment_currency: paymentCurrency,
        platform: "ugig.net",
      },
    });

    const cpPayment = paymentResult.payment || paymentResult;
    const paymentId = paymentResult.payment_id || (cpPayment as any).id;
    const paymentAddress = (cpPayment as any).payment_address || paymentResult.address || null;
    const checkoutUrl = paymentResult.checkout_url || (cpPayment as any).checkout_url || null;
    const amountCrypto =
      paymentResult.amount_crypto ||
      (cpPayment as any).amount_crypto ||
      (cpPayment as any).crypto_amount ||
      null;
    const expiresAt = paymentResult.expires_at || (cpPayment as any).expires_at || null;
    const responseCurrency = paymentResult.currency || (cpPayment as any).currency || paymentCurrency;

    if (!paymentId) {
      return NextResponse.json(
        { error: "CoinPay did not return a payment id" },
        { status: 502 }
      );
    }

    if (!paymentAddress) {
      return NextResponse.json(
        { error: "CoinPay did not return an in-app payment address" },
        { status: 502 }
      );
    }

    // Create local invoice record
    const { data: invoice, error } = await (supabase as any)
      .from("gig_invoices")
      .insert({
        gig_id: gigId,
        application_id,
        worker_id: user.id,
        poster_id: gig.poster_id,
        coinpay_invoice_id: paymentId,
        amount_usd: amount,
        currency,
        status: "sent",
        pay_url: null,
        notes,
        due_date: due_date || null,
        metadata: {
          payment_address: paymentAddress,
          amount_crypto: amountCrypto,
          payment_currency: responseCurrency,
          checkout_url: checkoutUrl,
          expires_at: expiresAt,
        },
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create invoice record:", error);
      return NextResponse.json(
        { error: "Failed to create invoice" },
        { status: 500 }
      );
    }

    // Notify the poster
    const { data: workerProfile } = await supabase
      .from("profiles")
      .select("username, full_name")
      .eq("id", user.id)
      .single();

    await supabase.from("notifications").insert({
      user_id: gig.poster_id,
      type: "payment_received",
      title: "Invoice received",
      body: `${workerProfile?.full_name || workerProfile?.username || "A worker"} sent you a $${amount} invoice for "${gig.title}".`,
      data: {
        gig_id: gigId,
        invoice_id: invoice.id,
      },
    });

    return NextResponse.json({
      data: {
        invoice_id: invoice.id,
        coinpay_invoice_id: paymentId,
        pay_url: null,
        payment_address: paymentAddress,
        amount_crypto: amountCrypto,
        payment_currency: responseCurrency,
        expires_at: expiresAt,
        metadata: invoice.metadata,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Invoice creation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
