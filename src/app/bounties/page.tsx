import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Target, DollarSign, Users, Plus } from "lucide-react";
import { formatBountyPayout } from "@/lib/bounties";

export const metadata: Metadata = {
  title: "Bounties | ugig.net",
  description:
    "Open bounties with structured submission forms. Earn by completing tasks, providing feedback, and more.",
  alternates: { canonical: "/bounties" },
};

interface BountyListItem {
  id: string;
  title: string;
  description: string;
  payout_usd: number;
  payout_currency: string;
  payment_coin: string | null;
  max_submissions: number | null;
  status: string;
  created_at: string;
  creator: {
    id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export default async function BountiesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bounties" as any)
    .select(
      `
      id, title, description, payout_usd, payout_currency, payment_coin, max_submissions,
      status, created_at,
      creator:profiles!creator_id (id, username, full_name, avatar_url)
    `
    )
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(100);

  const bounties = (data || []) as unknown as BountyListItem[];

  return (
    <>
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Target className="h-6 w-6 text-primary" />
                </div>
                <h1 className="text-3xl font-bold">Bounties</h1>
              </div>
              <p className="text-muted-foreground">
                Complete short tasks for a fixed payout. Answer the form, get
                approved, get paid.
              </p>
            </div>
            <Link href="/bounties/new">
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Post a bounty
              </Button>
            </Link>
          </div>

          {bounties.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-lg border border-border">
              <Target className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No open bounties yet</h3>
              <p className="text-muted-foreground mb-6">
                Be the first to post one.
              </p>
              <Link href="/bounties/new">
                <Button>Post the first bounty</Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bounties.map((b) => (
                <Link
                  key={b.id}
                  href={`/bounties/${b.id}`}
                  className="p-5 bg-card rounded-lg border border-border shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200"
                >
                  <h2 className="font-semibold line-clamp-2 mb-2">{b.title}</h2>
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                    {b.description}
                  </p>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground border-t border-border pt-3">
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                      <DollarSign className="h-4 w-4" />
                      {formatBountyPayout(b.payout_usd, b.payment_coin)}
                    </span>
                    <span className="text-xs">
                      by{" "}
                      {b.creator?.full_name ||
                        b.creator?.username ||
                        "Anonymous"}
                    </span>
                    {b.max_submissions && (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Users className="h-3 w-3" />
                        Cap: {b.max_submissions}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
