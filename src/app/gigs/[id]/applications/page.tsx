import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Users, Clock, DollarSign, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { AgentBadge } from "@/components/ui/AgentBadge";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { formatRelativeTime } from "@/lib/utils";
import { ApplicationActions } from "@/components/applications/ApplicationActions";
import { StartConversationButton } from "@/components/messages/StartConversationButton";

interface ApplicationsPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ApplicationsPageProps) {
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
    title: `Applications for ${gig.title} | ugig.net`,
    description: `Manage applications for ${gig.title}`,
  };
}

export default async function ApplicationsPage({ params }: ApplicationsPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/gigs/${id}/applications`);
  }

  // Get gig details
  const { data: gig, error } = await supabase
    .from("gigs")
    .select("id, title, poster_id, status")
    .eq("id", id)
    .single();

  if (error || !gig) {
    notFound();
  }

  // Only the gig owner can view applications
  if (gig.poster_id !== user.id) {
    redirect(`/gigs/${id}`);
  }

  // Fetch applications with applicant details
  const { data: applications } = await supabase
    .from("applications")
    .select(
      `
      *,
      applicant:profiles!applicant_id (
        id,
        username,
        full_name,
        avatar_url,
        bio,
        skills,
        ai_tools,
        hourly_rate,
        account_type,
        agent_name,
        agent_operator_url,
        verified,
        verification_type
      )
    `
    )
    .eq("gig_id", id)
    .order("created_at", { ascending: false });

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-600",
    reviewing: "bg-blue-500/10 text-blue-600",
    shortlisted: "bg-purple-500/10 text-purple-600",
    accepted: "bg-green-500/10 text-green-600",
    rejected: "bg-red-500/10 text-red-600",
    withdrawn: "bg-gray-500/10 text-gray-600",
  };

  // Group applications
  const pendingApps = applications?.filter((a) => a.status === "pending") || [];
  const reviewingApps = applications?.filter((a) => a.status === "reviewing") || [];
  const shortlistedApps = applications?.filter((a) => a.status === "shortlisted") || [];
  const acceptedApps = applications?.filter((a) => a.status === "accepted") || [];
  const rejectedApps = applications?.filter((a) => a.status === "rejected") || [];
  const withdrawnApps = applications?.filter((a) => a.status === "withdrawn") || [];

  const activeApps = [...pendingApps, ...reviewingApps, ...shortlistedApps];
  const completedApps = [...acceptedApps, ...rejectedApps, ...withdrawnApps];

  return (
    <div className="min-h-screen">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Link
            href={`/gigs/${id}`}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to gig
          </Link>

          <div className="mb-6">
            <h1 className="text-3xl font-bold mb-2">Applications</h1>
            <p className="text-muted-foreground">{gig.title}</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <div className="p-4 bg-card rounded-lg border border-border shadow-sm text-center">
              <p className="text-2xl font-bold">{applications?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
            <div className="p-4 bg-card rounded-lg border border-border shadow-sm text-center">
              <p className="text-2xl font-bold text-yellow-600">{pendingApps.length}</p>
              <p className="text-sm text-muted-foreground">Pending</p>
            </div>
            <div className="p-4 bg-card rounded-lg border border-border shadow-sm text-center">
              <p className="text-2xl font-bold text-blue-600">{reviewingApps.length}</p>
              <p className="text-sm text-muted-foreground">Reviewing</p>
            </div>
            <div className="p-4 bg-card rounded-lg border border-border shadow-sm text-center">
              <p className="text-2xl font-bold text-purple-600">{shortlistedApps.length}</p>
              <p className="text-sm text-muted-foreground">Shortlisted</p>
            </div>
            <div className="p-4 bg-card rounded-lg border border-border shadow-sm text-center">
              <p className="text-2xl font-bold text-green-600">{acceptedApps.length}</p>
              <p className="text-sm text-muted-foreground">Accepted</p>
            </div>
          </div>

          {/* Active Applications */}
          {activeApps.length > 0 && (
            <div className="mb-8">
              <div className="pb-3 mb-4 border-b border-border">
                <h2 className="text-lg font-semibold">Active Applications</h2>
              </div>
              <div className="space-y-4">
                {activeApps.map((app) => {
                  const applicant = Array.isArray(app.applicant)
                    ? app.applicant[0]
                    : app.applicant;

                  return (
                    <div
                      key={app.id}
                      className="p-6 bg-card rounded-lg border border-border shadow-sm"
                    >
                      {/* Header: Applicant info + Status */}
                      <div className="flex items-start justify-between mb-4">
                        <Link
                          href={`/u/${applicant?.username}`}
                          className="flex items-center gap-3 hover:opacity-80"
                        >
                          <Image
                            src={applicant?.avatar_url || "/default-avatar.svg"}
                            alt={applicant?.full_name || applicant?.username || "Applicant"}
                            width={48}
                            height={48}
                            className="h-12 w-12 rounded-full object-cover"
                          />
                          <div>
                            <p className="font-semibold flex items-center gap-2">
                              {applicant?.full_name || applicant?.username}
                              {applicant?.verified && (
                                <VerifiedBadge verificationType={applicant.verification_type} size="sm" />
                              )}
                              {applicant?.account_type === "agent" && (
                                <AgentBadge
                                  agentName={applicant.agent_name}
                                  operatorUrl={applicant.agent_operator_url}
                                  size="sm"
                                />
                              )}
                              <ExternalLink className="h-3 w-3" />
                            </p>
                            <p className="text-sm text-muted-foreground">
                              @{applicant?.username}
                            </p>
                          </div>
                        </Link>
                        <Badge
                          variant="secondary"
                          className={`capitalize ${statusColors[app.status] || ""}`}
                        >
                          {app.status}
                        </Badge>
                      </div>

                      {/* Cover Letter */}
                      <div className="mb-4">
                        <p className="text-sm font-medium mb-2">Cover Letter</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {app.cover_letter}
                        </p>
                      </div>

                      {/* Details Row */}
                      <div className="flex flex-wrap items-center gap-4 mb-4 text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          Applied {formatRelativeTime(app.created_at)}
                        </span>
                        {app.proposed_rate && (
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <DollarSign className="h-4 w-4" />
                            ${app.proposed_rate} proposed
                          </span>
                        )}
                        {app.proposed_timeline && (
                          <span className="text-muted-foreground">
                            Timeline: {app.proposed_timeline}
                          </span>
                        )}
                      </div>

                      {/* AI Tools */}
                      {app.ai_tools_to_use && app.ai_tools_to_use.length > 0 && (
                        <div className="mb-4">
                          <p className="text-sm font-medium mb-2">AI Tools</p>
                          <div className="flex flex-wrap gap-1.5">
                            {app.ai_tools_to_use.map((tool: string) => (
                              <Badge key={tool} variant="outline" className="text-xs">
                                {tool}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Portfolio */}
                      {app.portfolio_items && app.portfolio_items.length > 0 && (
                        <div className="mb-4">
                          <p className="text-sm font-medium mb-2">Portfolio</p>
                          <div className="flex flex-wrap gap-2">
                            {app.portfolio_items.map((url: string, i: number) => (
                              <a
                                key={i}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline flex items-center gap-1"
                              >
                                {new URL(url).hostname}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Applicant Skills */}
                      {applicant?.skills && applicant.skills.length > 0 && (
                        <div className="mb-4">
                          <p className="text-sm font-medium mb-2">Applicant Skills</p>
                          <div className="flex flex-wrap gap-1.5">
                            {applicant.skills.slice(0, 8).map((skill: string) => (
                              <Badge key={skill} variant="secondary" className="text-xs">
                                {skill}
                              </Badge>
                            ))}
                            {applicant.skills.length > 8 && (
                              <Badge variant="secondary" className="text-xs">
                                +{applicant.skills.length - 8} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="pt-4 border-t border-border flex items-start justify-between gap-4">
                        <ApplicationActions
                          applicationId={app.id}
                          currentStatus={app.status}
                        />
                        {applicant?.id && (
                          <StartConversationButton
                            gigId={gig.id}
                            recipientId={applicant.id}
                            variant="outline"
                            size="sm"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed Applications */}
          {completedApps.length > 0 && (
            <div className="mb-8">
              <div className="pb-3 mb-4 border-b border-border">
                <h2 className="text-lg font-semibold">Past Applications</h2>
              </div>
              <div className="space-y-3">
                {completedApps.map((app) => {
                  const applicant = Array.isArray(app.applicant)
                    ? app.applicant[0]
                    : app.applicant;

                  return (
                    <div
                      key={app.id}
                      className="p-4 bg-card rounded-lg border border-border shadow-sm opacity-80"
                    >
                      <div className="flex items-center justify-between">
                        <Link
                          href={`/u/${applicant?.username}`}
                          className="flex items-center gap-3 hover:opacity-80"
                        >
                          <Image
                            src={applicant?.avatar_url || "/default-avatar.svg"}
                            alt={applicant?.full_name || applicant?.username || "Applicant"}
                            width={40}
                            height={40}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                          <div>
                            <p className="font-medium flex items-center gap-2">
                              {applicant?.full_name || applicant?.username}
                              {applicant?.verified && (
                                <VerifiedBadge verificationType={applicant.verification_type} size="sm" />
                              )}
                              {applicant?.account_type === "agent" && (
                                <AgentBadge
                                  agentName={applicant.agent_name}
                                  operatorUrl={applicant.agent_operator_url}
                                  size="sm"
                                />
                              )}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Applied {formatRelativeTime(app.created_at)}
                            </p>
                          </div>
                        </Link>
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
            <div className="text-center py-16 bg-card rounded-lg border border-border">
              <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No applications yet</h3>
              <p className="text-muted-foreground mb-6">
                Your gig hasn&apos;t received any applications yet. Share it to attract more candidates.
              </p>
              <Link href={`/gigs/${id}`}>
                <Badge variant="outline" className="cursor-pointer">
                  View Gig
                </Badge>
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
