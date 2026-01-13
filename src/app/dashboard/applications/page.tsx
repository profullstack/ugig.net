import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/layout/Header";
import { ArrowLeft, ExternalLink, Clock, DollarSign, Calendar, FileText } from "lucide-react";

export const metadata = {
  title: "My Applications | ugig.net",
  description: "Track your job applications",
};

export default async function MyApplicationsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard/applications");
  }

  // Fetch user's applications with gig details
  const { data: applications } = await supabase
    .from("applications")
    .select(
      `
      *,
      gig:gigs (
        id,
        title,
        category,
        budget_type,
        budget_min,
        budget_max,
        status,
        poster:profiles!poster_id (
          username,
          full_name
        )
      )
    `
    )
    .eq("applicant_id", user.id)
    .order("created_at", { ascending: false });

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-600",
    reviewing: "bg-blue-500/10 text-blue-600",
    shortlisted: "bg-purple-500/10 text-purple-600",
    accepted: "bg-green-500/10 text-green-600",
    rejected: "bg-red-500/10 text-red-600",
    withdrawn: "bg-gray-500/10 text-gray-600",
  };

  const statusDescriptions: Record<string, string> = {
    pending: "Waiting for the gig poster to review",
    reviewing: "Your application is being reviewed",
    shortlisted: "You're on the shortlist!",
    accepted: "Congratulations! You've been accepted",
    rejected: "Unfortunately not selected this time",
    withdrawn: "You withdrew this application",
  };

  // Group applications by status
  const activeApplications =
    applications?.filter((app) =>
      ["pending", "reviewing", "shortlisted"].includes(app.status)
    ) || [];
  const completedApplications =
    applications?.filter((app) =>
      ["accepted", "rejected", "withdrawn"].includes(app.status)
    ) || [];

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

          <div className="mb-6">
            <h1 className="text-3xl font-bold mb-2">My Applications</h1>
            <p className="text-muted-foreground">
              Track the status of your gig applications
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="p-5 bg-card rounded-lg border border-border shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 text-center">
              <p className="text-2xl font-bold">{applications?.length || 0}</p>
              <p className="text-sm text-muted-foreground mt-1">Total</p>
            </div>
            <div className="p-5 bg-card rounded-lg border border-border shadow-sm hover:shadow-md hover:border-yellow-500/30 transition-all duration-200 text-center">
              <p className="text-2xl font-bold text-yellow-600">
                {applications?.filter((a) => a.status === "pending").length || 0}
              </p>
              <p className="text-sm text-muted-foreground mt-1">Pending</p>
            </div>
            <div className="p-5 bg-card rounded-lg border border-border shadow-sm hover:shadow-md hover:border-purple-500/30 transition-all duration-200 text-center">
              <p className="text-2xl font-bold text-purple-600">
                {applications?.filter((a) => a.status === "shortlisted").length || 0}
              </p>
              <p className="text-sm text-muted-foreground mt-1">Shortlisted</p>
            </div>
            <div className="p-5 bg-card rounded-lg border border-border shadow-sm hover:shadow-md hover:border-green-500/30 transition-all duration-200 text-center">
              <p className="text-2xl font-bold text-green-600">
                {applications?.filter((a) => a.status === "accepted").length || 0}
              </p>
              <p className="text-sm text-muted-foreground mt-1">Accepted</p>
            </div>
          </div>

          {/* Active Applications */}
          {activeApplications.length > 0 && (
            <div className="mb-8">
              <div className="pb-3 mb-4 border-b border-border">
                <h2 className="text-lg font-semibold">Active Applications</h2>
              </div>
              <div className="space-y-4">
                {activeApplications.map((app) => {
                  const gig = app.gig as {
                    id: string;
                    title: string;
                    category: string;
                    budget_type: string;
                    budget_min: number | null;
                    budget_max: number | null;
                    status: string;
                    poster: { username: string; full_name: string | null };
                  };

                  return (
                    <div
                      key={app.id}
                      className="p-6 bg-card rounded-lg border border-border shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <Link
                            href={`/gigs/${gig.id}`}
                            className="text-lg font-semibold hover:text-primary flex items-center gap-2 transition-colors"
                          >
                            {gig.title}
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                          <p className="text-sm text-muted-foreground mt-1">
                            Posted by {gig.poster?.full_name || gig.poster?.username}
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className={`capitalize ${statusColors[app.status] || ""}`}
                        >
                          {app.status}
                        </Badge>
                      </div>

                      <p className="text-sm text-muted-foreground mb-4">
                        {statusDescriptions[app.status]}
                      </p>

                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>Applied {new Date(app.created_at).toLocaleDateString()}</span>
                        </div>
                        {(gig.budget_min || gig.budget_max) && (
                          <div className="flex items-center gap-1.5">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            <span>
                              {gig.budget_min && gig.budget_max
                                ? `$${gig.budget_min} - $${gig.budget_max}`
                                : gig.budget_min
                                ? `$${gig.budget_min}+`
                                : `Up to $${gig.budget_max}`}
                              {gig.budget_type === "hourly" ? "/hr" : " fixed"}
                            </span>
                          </div>
                        )}
                        {app.proposed_rate && (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span>Proposed: ${app.proposed_rate}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed Applications */}
          {completedApplications.length > 0 && (
            <div>
              <div className="pb-3 mb-4 border-b border-border">
                <h2 className="text-lg font-semibold">Past Applications</h2>
              </div>
              <div className="space-y-3">
                {completedApplications.map((app) => {
                  const gig = app.gig as {
                    id: string;
                    title: string;
                    category: string;
                    budget_type: string;
                    budget_min: number | null;
                    budget_max: number | null;
                    status: string;
                    poster: { username: string; full_name: string | null };
                  };

                  return (
                    <div
                      key={app.id}
                      className="p-4 bg-card rounded-lg border border-border shadow-sm opacity-80 hover:opacity-100 transition-opacity duration-200"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <Link
                            href={`/gigs/${gig.id}`}
                            className="font-medium hover:text-primary flex items-center gap-2 transition-colors"
                          >
                            {gig.title}
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            Applied {new Date(app.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className={`capitalize ${statusColors[app.status] || ""}`}
                        >
                          {app.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty State */}
          {(!applications || applications.length === 0) && (
            <div className="text-center py-16 bg-card rounded-lg border border-border shadow-sm">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No applications yet</h3>
              <p className="text-muted-foreground mb-6">
                Browse available gigs and submit your first application
              </p>
              <Link href="/gigs">
                <Button>Browse Gigs</Button>
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
