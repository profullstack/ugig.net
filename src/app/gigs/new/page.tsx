import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { GigForm } from "@/components/gigs/GigForm";
import { Header } from "@/components/layout/Header";

export const metadata = {
  title: "Post a Gig | ugig.net",
  description: "Post a new gig on ugig.net",
};

export default async function NewGigPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/gigs/new");
  }

  // Check gig usage for free users
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("user_id", user.id)
    .single();

  let usageWarning = null;
  if (!subscription || subscription.plan === "free") {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const { data: usage } = await supabase
      .from("gig_usage")
      .select("posts_count")
      .eq("user_id", user.id)
      .eq("month", month)
      .eq("year", year)
      .single();

    const postsUsed = usage?.posts_count || 0;
    const postsRemaining = 10 - postsUsed;

    if (postsRemaining <= 0) {
      usageWarning = "limit_reached";
    } else if (postsRemaining <= 3) {
      usageWarning = `${postsRemaining} posts remaining this month`;
    }
  }

  return (
    <div className="min-h-screen">
      <Header showPostGig={false} />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Link
            href="/dashboard/gigs"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to my gigs
          </Link>

          <h1 className="text-3xl font-bold mb-2">Post a New Gig</h1>
          <p className="text-muted-foreground mb-8">
            Describe your project and find the perfect AI-assisted professional
          </p>

          {usageWarning === "limit_reached" ? (
            <div className="p-6 bg-destructive/10 border border-destructive rounded-lg">
              <h2 className="font-semibold text-destructive mb-2">
                Monthly Limit Reached
              </h2>
              <p className="text-muted-foreground mb-4">
                You&apos;ve used all 10 free gig posts for this month. Upgrade
                to Pro for unlimited posts.
              </p>
              <Link
                href="/settings/billing"
                className="text-primary hover:underline"
              >
                Upgrade to Pro - $5.99/month
              </Link>
            </div>
          ) : (
            <>
              {usageWarning && (
                <div className="p-4 mb-6 bg-primary/10 border border-primary/20 rounded-lg">
                  <p className="text-sm">{usageWarning}</p>
                </div>
              )}
              <GigForm />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
