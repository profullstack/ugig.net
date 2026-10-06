import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, getAuthContext } from "@/lib/auth/get-user";
import { stripe, PLANS } from "@/lib/stripe";

// POST /api/subscriptions/checkout - Create Stripe checkout session
export async function POST(request: NextRequest) {
  try {
    // Session or full-access API key (public-scope keys get 401 here).
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    // Get or create Stripe customer
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, plan, status")
      .eq("user_id", user.id)
      .single();

    // Check if already on Pro plan with active subscription
    if (
      subscription?.plan === "pro" &&
      ["active", "trialing"].includes(subscription?.status || "")
    ) {
      return NextResponse.json(
        { error: "You already have an active Pro subscription" },
        { status: 400 }
      );
    }

    let customerId = subscription?.stripe_customer_id;

    if (!customerId) {
      // Get user profile for customer creation
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, full_name")
        .eq("id", user.id)
        .single();

      // API-key callers carry no email on the auth context; Stripe needs one
      // for receipts, so read it from the auth user.
      let email = user.email;
      if (!email) {
        const { data: authUser } = await createServiceClient().auth.admin.getUserById(user.id);
        email = authUser?.user?.email ?? undefined;
      }

      // Create Stripe customer
      const customer = await stripe.customers.create({
        email,
        name: profile?.full_name || profile?.username || undefined,
        metadata: {
          supabase_user_id: user.id,
        },
      });

      customerId = customer.id;

      // Create or update subscription record with customer ID
      await supabase.from("subscriptions").upsert(
        {
          user_id: user.id,
          stripe_customer_id: customerId,
          plan: "free",
          status: "canceled",
        },
        { onConflict: "user_id" }
      );
    }

    // Get base URL from request
    const baseUrl = new URL(request.url).origin;

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: PLANS.pro.priceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/dashboard/subscription?success=true`,
      cancel_url: `${baseUrl}/dashboard/subscription?canceled=true`,
      metadata: {
        user_id: user.id,
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
