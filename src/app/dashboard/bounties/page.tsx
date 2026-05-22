import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Plus,
  Target,
  DollarSign,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { formatBountyPayout } from "@/lib/bounties";

export const metadata = {
  title: "My Bounties | ugig.net",
  description: "Manage bounties you've posted or submitted to",
};

type TabKey = "created" | "submitted";

export default async function DashboardBountiesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?redirect=/dashboard/bounties");
  }

  const tabParam = (await searchParams).tab;
  const tab: TabKey = tabParam === "submitted" ? "submitted" : "created";

  // Bounties I've created
  const { data: createdData } = await (supabase as any)
    .from("bounties")
    .select("id, title, payout_usd, payment_coin, max_submissions, status, created_at")
    .eq("creator_id", user.id)
    .order("created_at", { ascending: false });
  const created = (createdData || []) as Array<{
    id: string;
    title: string;
    payout_usd: number;
    payment_coin: string | null;
    max_submissions: number | null;
    status: string;
    created_at: string;
  }>;

  // Submission counts per bounty I created (best-effort, single query)
  const createdIds = created.map((b) => b.id);
  const submissionStats: Record<
    string,
    { total: number; pending: number; approved_unpaid: number }
  > = {};
  if (createdIds.length > 0) {
    const { data: subs } = await (supabase as any)
      .from("bounty_submissions")
      .select("bounty_id, status, payout_status")
      .in("bounty_id", createdIds);
    for (const id of createdIds) {
      submissionStats[id] = { total: 0, pending: 0, approved_unpaid: 0 };
    }
    for (const s of subs || []) {
      const stat = submissionStats[s.bounty_id];
      if (!stat) continue;
      stat.total += 1;
      if (s.status === "pending") stat.pending += 1;
      if (s.status === "approved" && s.payout_status === "unpaid") {
        stat.approved_unpaid += 1;
      }
    }
  }

  // Bounties I've submitted to
  const { data: submittedData } = await (supabase as any)
    .from("bounty_submissions")
    .select(
      `
      id, status, payout_status, pay_url, created_at,
      bounty:bounties (id, title, payout_usd, payment_coin)
    `
    )
    .eq("submitter_id", user.id)
    .order("created_at", { ascending: false });
  const submitted = (submittedData || []) as Array<{
    id: string;
    status: "pending" | "approved" | "rejected";
    payout_status: "unpaid" | "invoiced" | "paid";
    pay_url: string | null;
    created_at: string;
    bounty: { id: string; title: string; payout_usd: number; payment_coin: string | null } | null;
  }>;

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Bounties</h1>
            <p className="text-muted-foreground">
              Manage bounties you&apos;ve posted and submissions you&apos;ve
              made.
            </p>
          </div>
          <Link href="/bounties/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Post bounty
            </Button>
          </Link>
        </div>

        <div className="flex gap-1 border-b border-border mb-6">
          <Link
            href="/dashboard/bounties?tab=created"
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "created"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Bounties I posted ({created.length})
          </Link>
          <Link
            href="/dashboard/bounties?tab=submitted"
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "submitted"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            My submissions ({submitted.length})
          </Link>
        </div>

        {tab === "created" ? (
          created.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-lg border border-border">
              <Target className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No bounties yet</h3>
              <p className="text-muted-foreground mb-6">
                Post your first bounty to start collecting submissions.
              </p>
              <Link href="/bounties/new">
                <Button>Post a bounty</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {created.map((b) => {
                const stat = submissionStats[b.id] || {
                  total: 0,
                  pending: 0,
                  approved_unpaid: 0,
                };
                return (
                  <Link
                    key={b.id}
                    href={`/bounties/${b.id}`}
                    className="block p-4 bg-card border border-border rounded-lg shadow-sm hover:shadow-md hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="font-medium">{b.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Posted {new Date(b.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant="secondary" className="capitalize">
                        {b.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-2">
                      <span className="inline-flex items-center gap-1 text-sm text-foreground font-medium">
                        <DollarSign className="h-3.5 w-3.5" />
                        {formatBountyPayout(b.payout_usd, b.payment_coin)}
                      </span>
                      <span>
                        {stat.total} submission{stat.total === 1 ? "" : "s"}
                        {b.max_submissions && ` / ${b.max_submissions}`}
                      </span>
                      {stat.pending > 0 && (
                        <span className="text-yellow-600 font-medium">
                          {stat.pending} awaiting review
                        </span>
                      )}
                      {stat.approved_unpaid > 0 && (
                        <span className="text-blue-600 font-medium">
                          {stat.approved_unpaid} approved &amp; unpaid
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        ) : submitted.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-lg border border-border">
            <Target className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No submissions yet</h3>
            <p className="text-muted-foreground mb-6">
              Browse open bounties and submit to start earning.
            </p>
            <Link href="/bounties">
              <Button>Browse bounties</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {submitted.map((s) => (
              <Link
                key={s.id}
                href={s.bounty ? `/bounties/${s.bounty.id}` : "#"}
                className="block p-4 bg-card border border-border rounded-lg shadow-sm hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <p className="font-medium">{s.bounty?.title || "Bounty"}</p>
                  <div className="flex items-center gap-2">
                    {s.status === "pending" && (
                      <Badge variant="secondary" className="gap-1">
                        <Clock className="h-3 w-3" /> Pending
                      </Badge>
                    )}
                    {s.status === "approved" && (
                      <Badge className="gap-1 bg-green-500/10 text-green-600 border-green-500/20">
                        <CheckCircle2 className="h-3 w-3" /> Approved
                      </Badge>
                    )}
                    {s.status === "rejected" && (
                      <Badge variant="secondary" className="gap-1 text-destructive">
                        <XCircle className="h-3 w-3" /> Rejected
                      </Badge>
                    )}
                    {s.payout_status === "paid" && (
                      <Badge className="gap-1 bg-green-500/10 text-green-600 border-green-500/20">
                        Paid
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Submitted {new Date(s.created_at).toLocaleDateString()}
                  {s.bounty && (
                    <> · {formatBountyPayout(s.bounty.payout_usd, s.bounty.payment_coin)} payout</>
                  )}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
