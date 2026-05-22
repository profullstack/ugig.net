import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  DollarSign,
  Users,
  Clock,
  Lock,
  Pencil,
} from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
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
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/bounties"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            All bounties
          </Link>

          <div className="bg-card border border-border rounded-lg p-6 shadow-sm mb-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h1 className="text-2xl font-bold mb-2">{bounty.title}</h1>
                <p className="text-sm text-muted-foreground">
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
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-base">
                  <DollarSign className="h-4 w-4 mr-0.5" />
                  {Number(bounty.payout_usd).toFixed(2)}
                </Badge>
                {bounty.payment_coin && (
                  <Badge variant="secondary">{bounty.payment_coin}</Badge>
                )}
                {isCreator && (
                  <Link href={`/bounties/${bounty.id}/edit`}>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  </Link>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-6">
              <div className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {submissionCount || 0} submission
                {(submissionCount ?? 0) === 1 ? "" : "s"}
                {bounty.max_submissions && ` / ${bounty.max_submissions}`}
              </div>
              <div className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                Posted {new Date(bounty.created_at).toLocaleDateString()}
              </div>
              {bounty.status !== "open" && (
                <Badge variant="secondary" className="capitalize">
                  {bounty.status}
                </Badge>
              )}
            </div>

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
      </main>
    </>
  );
}
