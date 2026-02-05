import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { ApplyForm } from "@/components/applications/ApplyForm";
import { EscrowBadge } from "@/components/gigs/EscrowBadge";

interface ApplyPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ApplyPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: gig } = await supabase
    .from("gigs")
    .select("title")
    .eq("id", id)
    .single();

  if (!gig) {
    return { title: "Gig Not Found | ugig.net" };
  }

  return {
    title: `Apply to ${gig.title} | ugig.net`,
    description: `Submit your application for ${gig.title}`,
  };
}

export default async function ApplyPage({ params }: ApplyPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Check if user is logged in
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/gigs/${id}/apply`);
  }

  // Get gig details
  const { data: gig, error } = await supabase
    .from("gigs")
    .select("id, title, poster_id, status, budget_type, budget_min, budget_max, budget_unit, payment_coin, ai_tools_preferred")
    .eq("id", id)
    .single();

  if (error || !gig) {
    notFound();
  }

  // Can't apply to own gig
  if (gig.poster_id === user.id) {
    redirect(`/gigs/${id}`);
  }

  // Gig must be active
  if (gig.status !== "active") {
    redirect(`/gigs/${id}`);
  }

  // Check if already applied
  const { data: existingApplication } = await supabase
    .from("applications")
    .select("id")
    .eq("gig_id", id)
    .eq("applicant_id", user.id)
    .single();

  if (existingApplication) {
    redirect(`/gigs/${id}?already_applied=true`);
  }

  return (
    <div className="min-h-screen">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Link
            href={`/gigs/${id}`}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to gig
          </Link>

          <div className="mb-6">
            <EscrowBadge />
          </div>

          <ApplyForm
            gigId={gig.id}
            gigTitle={gig.title}
            budgetType={gig.budget_type}
            budgetMin={gig.budget_min}
            budgetMax={gig.budget_max}
            budgetUnit={gig.budget_unit}
            paymentCoin={gig.payment_coin}
            aiToolsPreferred={gig.ai_tools_preferred}
          />
        </div>
      </main>
    </div>
  );
}
