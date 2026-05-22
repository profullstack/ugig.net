import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { ArrowLeft } from "lucide-react";
import { BountyForm } from "../../new/BountyForm";

export const metadata = {
  title: "Edit bounty | ugig.net",
};

export default async function EditBountyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?redirect=/bounties/${id}/edit`);
  }

  const { data: bounty } = await (supabase as any)
    .from("bounties")
    .select(
      "id, creator_id, title, description, payout_usd, payment_coin, max_submissions, questions, status"
    )
    .eq("id", id)
    .single();

  if (!bounty) {
    notFound();
  }
  if (bounty.creator_id !== user.id) {
    redirect(`/bounties/${id}`);
  }

  return (
    <>
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <Link
            href={`/bounties/${id}`}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to bounty
          </Link>

          <div className="mb-6">
            <h1 className="text-3xl font-bold mb-2">Edit bounty</h1>
            <p className="text-muted-foreground">
              Adjust the title, description, payout, or questionnaire. Existing
              submissions stay attached.
            </p>
          </div>

          <BountyForm
            bountyId={id}
            initialData={{
              title: bounty.title,
              description: bounty.description,
              payout_usd: Number(bounty.payout_usd),
              payment_coin: bounty.payment_coin,
              max_submissions: bounty.max_submissions,
              questions: bounty.questions || [],
            }}
          />
        </div>
      </main>
    </>
  );
}
