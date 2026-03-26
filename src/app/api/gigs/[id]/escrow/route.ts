import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createEscrow, type SupportedCurrency } from "@/lib/coinpayportal";
import { z } from "zod";

const createEscrowSchema = z.object({
  application_id: z.string().uuid(),
  currency: z.enum(["usdc_pol", "usdc_sol", "pol", "sol", "btc", "eth", "usdc_eth", "usdt"]),
  depositor_address: z.string().min(10, "Depositor wallet address is required"),
  beneficiary_address: z.string().min(10, "Beneficiary wallet address is required"),
});

// GET /api/gigs/[id]/escrow - Get escrow status for a gig
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

    // Get escrows where user is poster or worker
    const { data: escrows, error } = await (supabase as any)
      .from("gig_escrows")
      .select(`
        *,
        worker:profiles!worker_id(id, username, full_name, avatar_url),
        poster:profiles!poster_id(id, username, full_name, avatar_url)
      `)
      .eq("gig_id", gigId)
      .or(`poster_id.eq.${user.id},worker_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: escrows || [] });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// POST /api/gigs/[id]/escrow - Create escrow for an accepted application
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
    const validationResult = createEscrowSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { application_id, currency, depositor_address, beneficiary_address } = validationResult.data;

    // Get gig — must be poster
    const { data: gig } = await supabase
      .from("gigs")
      .select("id, title, poster_id, budget_min, budget_max, budget_type")
      .eq("id", gigId)
      .single();

    if (!gig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    if (gig.poster_id !== user.id) {
      return NextResponse.json(
        { error: "Only the gig poster can create escrow" },
        { status: 403 }
      );
    }

    // Get application — must be accepted
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

    if (application.status !== "accepted") {
      return NextResponse.json(
        { error: "Application must be accepted before creating escrow" },
        { status: 400 }
      );
    }

    // Check no existing active escrow for this gig+application
    const { data: existingEscrow } = await (supabase as any)
      .from("gig_escrows")
      .select("id, status")
      .eq("gig_id", gigId)
      .eq("application_id", application_id)
      .not("status", "in", "(refunded)")
      .single();

    if (existingEscrow) {
      return NextResponse.json(
        { error: "An escrow already exists for this application" },
        { status: 409 }
      );
    }

    // Determine amount: proposed_rate > budget_min > budget_max
    const amount = application.proposed_rate || gig.budget_min || gig.budget_max;
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "No payment amount set. Set a budget on the gig or bid amount on the application." },
        { status: 400 }
      );
    }

    const platformFeeRate = 0.05; // 5%
    const platformFee = Math.round(amount * platformFeeRate * 100) / 100;

    // Get emails for escrow parties
    const { data: posterProfile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();

    const { data: workerProfile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", application.applicant_id)
      .single();

    // Create escrow on CoinPayPortal
    const escrowResult = await createEscrow({
      amount_usd: amount,
      currency: currency as SupportedCurrency,
      depositor_email: `${posterProfile?.username || user.id}@ugig.net`,
      beneficiary_email: `${workerProfile?.username || application.applicant_id}@ugig.net`,
      depositor_address,
      beneficiary_address,
      description: `Gig escrow: ${gig.title}`,
      metadata: {
        gig_id: gigId,
        application_id,
        poster_id: user.id,
        worker_id: application.applicant_id,
        platform: "ugig.net",
      },
    });

    // Extract payment address from response (coinpayportal uses escrow_address)
    // Handle various response shapes from the API
    console.log("[Escrow] CoinPayPortal response:", JSON.stringify(escrowResult, null, 2));
    const escrowData = (escrowResult.escrow || (escrowResult as any).data?.escrow || escrowResult) as Record<string, unknown>;
    const paymentAddress = (escrowData.escrow_address || escrowData.payment_address || escrowData.address || null) as string | null;

    // Create local escrow record
    const { data: escrow, error } = await (supabase as any)
      .from("gig_escrows")
      .insert({
        gig_id: gigId,
        poster_id: user.id,
        worker_id: application.applicant_id,
        application_id,
        coinpay_escrow_id: escrowData.id,
        amount_usd: amount,
        currency,
        platform_fee_usd: platformFee,
        platform_fee_rate: platformFeeRate,
        status: "pending_payment",
        metadata: {
          payment_address: paymentAddress,
          expires_at: escrowData.expires_at,
        },
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create escrow record:", error);
      return NextResponse.json(
        { error: "Failed to create escrow" },
        { status: 500 }
      );
    }

    // Notify worker
    await supabase.from("notifications").insert({
      user_id: application.applicant_id,
      type: "payment_received",
      title: "Escrow created for your gig",
      body: `${posterProfile?.username || "The gig poster"} has set up a $${amount} escrow payment for "${gig.title}". Funds will be released when the work is complete.`,
      data: {
        gig_id: gigId,
        escrow_id: escrow.id,
      },
    });

    return NextResponse.json({
      data: {
        escrow_id: escrow.id,
        coinpay_escrow_id: escrowData.id,
        payment_address: paymentAddress,
        amount_usd: amount,
        platform_fee_usd: platformFee,
        currency,
        expires_at: escrowData.expires_at,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Escrow creation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
