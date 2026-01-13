import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GigActions } from "@/components/gigs/GigActions";
import { Header } from "@/components/layout/Header";
import {
  Plus,
  ArrowLeft,
  Eye,
  Users,
} from "lucide-react";

export const metadata = {
  title: "My Gigs | ugig.net",
  description: "Manage your posted gigs",
};

export default async function MyGigsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard/gigs");
  }

  // Fetch user's gigs
  const { data: gigs } = await supabase
    .from("gigs")
    .select("*")
    .eq("poster_id", user.id)
    .order("created_at", { ascending: false });

  const statusColors: Record<string, string> = {
    draft: "bg-gray-500/10 text-gray-600",
    active: "bg-green-500/10 text-green-600",
    paused: "bg-yellow-500/10 text-yellow-600",
    closed: "bg-red-500/10 text-red-600",
    filled: "bg-blue-500/10 text-blue-600",
  };

  return (
    <div className="min-h-screen">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">My Gigs</h1>
              <p className="text-muted-foreground">
                Manage your posted gigs and view applications
              </p>
            </div>
            <Link href="/gigs/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Post New Gig
              </Button>
            </Link>
          </div>

          {gigs && gigs.length > 0 ? (
            <div className="space-y-4">
              {gigs.map((gig) => (
                <div
                  key={gig.id}
                  className="p-6 bg-card rounded-lg border border-border"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Link
                          href={`/gigs/${gig.id}`}
                          className="text-lg font-semibold hover:text-primary"
                        >
                          {gig.title}
                        </Link>
                        <Badge
                          variant="secondary"
                          className={statusColors[gig.status] || ""}
                        >
                          {gig.status}
                        </Badge>
                      </div>

                      <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
                        {gig.description}
                      </p>

                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-1.5">
                          <Eye className="h-4 w-4 text-muted-foreground" />
                          <span>{gig.views_count || 0} views</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <Link
                            href={`/gigs/${gig.id}/applications`}
                            className="text-primary hover:underline"
                          >
                            {gig.applications_count || 0} applications
                          </Link>
                        </div>
                        <span className="text-muted-foreground">
                          Posted {new Date(gig.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <GigActions gigId={gig.id} status={gig.status} />
                  </div>

                  {/* Quick stats bar */}
                  <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-lg font-semibold">{gig.budget_min ? `$${gig.budget_min}` : "-"}</p>
                      <p className="text-xs text-muted-foreground">Min Budget</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold">{gig.budget_max ? `$${gig.budget_max}` : "-"}</p>
                      <p className="text-xs text-muted-foreground">Max Budget</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold capitalize">{gig.budget_type}</p>
                      <p className="text-xs text-muted-foreground">Rate Type</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-card rounded-lg border border-border">
              <h3 className="text-lg font-semibold mb-2">No gigs posted yet</h3>
              <p className="text-muted-foreground mb-4">
                Post your first gig to start finding AI-powered professionals
              </p>
              <Link href="/gigs/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Post Your First Gig
                </Button>
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
