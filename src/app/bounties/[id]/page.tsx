import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Users,
  Clock,
  Lock,
  Pencil,
} from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { PriceBox, PriceBoxRow } from "@/components/ui/PriceBox";
import { formatBountyPayout } from "@/lib/bounties";
import { SubmitForm } from "./SubmitForm";
import { ReviewPanel } from "./ReviewPanel";

interface BountyDetail {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  payout_usd: number;
  payout_currency: string;
  payment_coin: string | null;
  max_submissions: number | null;
  status: "open" | "paused" | "closed";
  questions: {
    id: string;
    type: "short_text" | "long_text" | "multiple_choice";
    label: string;
    required: boolean;
    options?: string[];
  }[];
  created_at: string;
  creator: {
    id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export default async function BountyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: bountyData } = await supabase
    .from("bounties" as any)
    .select(
      `
      *,
      creator:profiles!creator_id (id, username, full_name, avatar_url)
    `
    )
    .eq("id", id)
    .single();

  if (!bountyData) {
    notFound();
  }
  const bounty = bountyData as unknown as BountyDetail;

  const isCreator = user?.id === bounty.creator_id;

  // Submission count
  const { count: submissionCount } = await (supabase as any)
    .from("bounty_submissions")
    .select("id", { count: "exact", head: true })
    .eq("bounty_id", id);

  // Check if current user has already submitted
  let mySubmission: { id: string; status: string } | null = null;
  if (user && !isCreator) {
    const { data } = await (supabase as any)
      .from("bounty_submissions")
      .select("id, status")
      .eq("bounty_id", id)
      .eq("submitter_id", user.id)
      .maybeSingle();
    mySubmission = data;
  }

  // For the creator: load all submissions
  let submissions: any[] = [];
  if (isCreator) {
    const { data } = await (supabase as any)
      .from("bounty_submissions")
      .select(
        `
        *,
        submitter:profiles!submitter_id (id, username, full_name, avatar_url)
      `
      )
      .eq("bounty_id", id)
      .order("created_at", { ascending: false });
    submissions = data || [];
  }

  const creatorName =
    bounty.creator?.full_name || bounty.creator?.username || "Anonymous";

  return (
    <>
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <Link
          href="/bounties"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          All bounties
        </Link>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {bounty.status !== "open" && (
                  <Badge variant="secondary" className="capitalize">
                    {bounty.status}
                  </Badge>
                )}
              </div>
              <h1 className="text-3xl font-bold mb-4">{bounty.title}</h1>
              <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
                <span>
                  Posted by{" "}
                  {bounty.creator?.username ? (
                    <Link
                      href={`/u/${bounty.creator.username}`}
                      className="hover:text-foreground hover:underline"
                    >
                      {creatorName}
                    </Link>
                  ) : (
                    creatorName
                  )}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Posted {new Date(bounty.created_at).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {submissionCount || 0} submission
                  {(submissionCount ?? 0) === 1 ? "" : "s"}
                  {bounty.max_submissions && ` / ${bounty.max_submissions}`}
                </span>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-4">Description</h2>
              <MarkdownContent content={bounty.description || ""} />
            </div>

            {/* Creator view: review panel */}
            {isCreator ? (
              <div>
                <h2 className="text-lg font-semibold mb-4">Submissions</h2>
                <ReviewPanel
                  bountyId={bounty.id}
                  payoutUsd={Number(bounty.payout_usd)}
                  questions={bounty.questions || []}
                  submissions={submissions}
                />
              </div>
            ) : (
              // Submitter view
              <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
                {!user ? (
                  <div className="text-center py-6">
                    <Lock className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
                    <p className="text-muted-foreground mb-4">
                      Sign in to submit to this bounty.
                    </p>
                    <Link href={`/login?redirect=/bounties/${bounty.id}`}>
                      <Button>Sign in</Button>
                    </Link>
                  </div>
                ) : bounty.status !== "open" ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    This bounty is no longer accepting submissions.
                  </div>
                ) : mySubmission ? (
                  <div className="text-center py-6">
                    <p className="font-medium mb-1">
                      You&apos;ve already submitted to this bounty.
                    </p>
                    <p className="text-sm text-muted-foreground capitalize">
                      Status: {mySubmission.status}
                    </p>
                  </div>
                ) : (
                  <>
                    <h2 className="text-lg font-semibold mb-4">
                      Submit to this bounty
                    </h2>
                    <SubmitForm
                      bountyId={bounty.id}
                      questions={bounty.questions || []}
                    />
                  </>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <PriceBox
              amount={formatBountyPayout(bounty.payout_usd, bounty.payment_coin)}
              subtitle="Per approved submission"
              topRight={
                isCreator ? (
                  <Link href={`/bounties/${bounty.id}/edit`}>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  </Link>
                ) : null
              }
            >
              <PriceBoxRow icon={<Users className="h-4 w-4" />}>
                {submissionCount || 0} submission
                {(submissionCount ?? 0) === 1 ? "" : "s"}
                {bounty.max_submissions && ` / ${bounty.max_submissions}`}
              </PriceBoxRow>
              {!isCreator && bounty.status === "open" && user && !mySubmission && (
                <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                  Scroll down to submit your answers.
                </p>
              )}
            </PriceBox>
          </div>
        </div>
      </main>
    </>
  );
}
