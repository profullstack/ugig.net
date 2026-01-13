import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

// GET /api/subscriptions - Get current user's subscription
export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: subscription, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Return default free subscription if none exists
    if (!subscription) {
      return NextResponse.json({
        data: {
          plan: "free",
          status: "active",
          cancel_at_period_end: false,
        },
      });
    }

    return NextResponse.json({ data: subscription });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// DELETE /api/subscriptions - Cancel subscription
export async function DELETE() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: subscription, error } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id, status")
      .eq("user_id", user.id)
      .single();

    if (error || !subscription) {
      return NextResponse.json(
        { error: "No subscription found" },
        { status: 404 }
      );
    }

    if (!subscription.stripe_subscription_id) {
      return NextResponse.json(
        { error: "No active Stripe subscription" },
        { status: 400 }
      );
    }

    // Cancel at period end instead of immediately
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    // Update local subscription record
    await supabase
      .from("subscriptions")
      .update({ cancel_at_period_end: true })
      .eq("user_id", user.id);

    return NextResponse.json({
      message: "Subscription will be canceled at the end of the billing period",
    });
  } catch (error) {
    console.error("Error canceling subscription:", error);
    return NextResponse.json(
      { error: "Failed to cancel subscription" },
      { status: 500 }
    );
  }
}

// PUT /api/subscriptions - Reactivate subscription (undo cancellation)
export async function PUT() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: subscription, error } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id, cancel_at_period_end")
      .eq("user_id", user.id)
      .single();

    if (error || !subscription) {
      return NextResponse.json(
        { error: "No subscription found" },
        { status: 404 }
      );
    }

    if (!subscription.stripe_subscription_id) {
      return NextResponse.json(
        { error: "No active Stripe subscription" },
        { status: 400 }
      );
    }

    if (!subscription.cancel_at_period_end) {
      return NextResponse.json(
        { error: "Subscription is not scheduled for cancellation" },
        { status: 400 }
      );
    }

    // Reactivate subscription
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: false,
    });

    // Update local subscription record
    await supabase
      .from("subscriptions")
      .update({ cancel_at_period_end: false })
      .eq("user_id", user.id);

    return NextResponse.json({
      message: "Subscription reactivated",
    });
  } catch (error) {
    console.error("Error reactivating subscription:", error);
    return NextResponse.json(
      { error: "Failed to reactivate subscription" },
      { status: 500 }
    );
  }
}
