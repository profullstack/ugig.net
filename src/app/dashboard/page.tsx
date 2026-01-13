import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ProfileCompletion } from "@/components/profile/ProfileCompletion";
import {
  Briefcase,
  FileText,
  Eye,
  Users,
  TrendingUp,
  Plus,
  ArrowRight,
  MessageSquare,
} from "lucide-react";

export const metadata = {
  title: "Dashboard | ugig.net",
  description: "Manage your gigs and applications",
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard");
  }

  // Fetch profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Fetch stats
  const [gigsResult, applicationsResult, viewsResult] = await Promise.all([
    // Count user's gigs
    supabase
      .from("gigs")
      .select("id", { count: "exact", head: true })
      .eq("poster_id", user.id),
    // Count user's applications
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("applicant_id", user.id),
    // Sum views on user's gigs
    supabase
      .from("gigs")
      .select("views_count")
      .eq("poster_id", user.id),
  ]);

  const totalGigs = gigsResult.count || 0;
  const totalApplications = applicationsResult.count || 0;
  const totalViews =
    viewsResult.data?.reduce((sum, gig) => sum + (gig.views_count || 0), 0) || 0;

  // Fetch recent applications to user's gigs
  const { data: recentApplications } = await supabase
    .from("applications")
    .select(
      `
      id,
      status,
      created_at,
      gig:gigs!gig_id (
        id,
        title,
        poster_id
      ),
      applicant:profiles!applicant_id (
        username,
        full_name
      )
    `
    )
    .eq("gig.poster_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  // Fetch subscription status
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan, status, current_period_end")
    .eq("user_id", user.id)
    .single();

  const isPro = subscription?.plan === "pro" && subscription?.status === "active";

  // Fetch gig usage for free users
  let postsRemaining = 10;
  if (!isPro) {
    const now = new Date();
    const { data: usage } = await supabase
      .from("gig_usage")
      .select("posts_count")
      .eq("user_id", user.id)
      .eq("month", now.getMonth() + 1)
      .eq("year", now.getFullYear())
      .single();

    postsRemaining = 10 - (usage?.posts_count || 0);
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-primary">
            ugig.net
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/gigs"
              className="text-muted-foreground hover:text-foreground"
            >
              Browse Gigs
            </Link>
            <Link href="/gigs/new">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Post a Gig
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            Welcome back, {profile?.full_name || profile?.username}!
          </h1>
          <p className="text-muted-foreground">
            Here&apos;s an overview of your activity on ugig.net
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="p-6 bg-card rounded-lg border border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalGigs}</p>
                <p className="text-sm text-muted-foreground">Posted Gigs</p>
              </div>
            </div>
          </div>

          <div className="p-6 bg-card rounded-lg border border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <FileText className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalApplications}</p>
                <p className="text-sm text-muted-foreground">Applications Sent</p>
              </div>
            </div>
          </div>

          <div className="p-6 bg-card rounded-lg border border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Eye className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalViews}</p>
                <p className="text-sm text-muted-foreground">Gig Views</p>
              </div>
            </div>
          </div>

          <div className="p-6 bg-card rounded-lg border border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {isPro ? "Pro" : `${postsRemaining}/10`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isPro ? "Unlimited Posts" : "Posts Remaining"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Quick Actions */}
          <div className="lg:col-span-2 space-y-6">
            <div className="p-6 bg-card rounded-lg border border-border">
              <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Link
                  href="/gigs/new"
                  className="p-4 border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <Briefcase className="h-5 w-5 text-primary mb-2" />
                  <h3 className="font-medium">Post a New Gig</h3>
                  <p className="text-sm text-muted-foreground">
                    Find AI professionals for your project
                  </p>
                </Link>

                <Link
                  href="/gigs"
                  className="p-4 border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <FileText className="h-5 w-5 text-primary mb-2" />
                  <h3 className="font-medium">Browse Gigs</h3>
                  <p className="text-sm text-muted-foreground">
                    Find work opportunities
                  </p>
                </Link>

                <Link
                  href="/dashboard/gigs"
                  className="p-4 border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <Users className="h-5 w-5 text-primary mb-2" />
                  <h3 className="font-medium">Manage My Gigs</h3>
                  <p className="text-sm text-muted-foreground">
                    View and edit your posted gigs
                  </p>
                </Link>

                <Link
                  href="/dashboard/applications"
                  className="p-4 border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <TrendingUp className="h-5 w-5 text-primary mb-2" />
                  <h3 className="font-medium">My Applications</h3>
                  <p className="text-sm text-muted-foreground">
                    Track your job applications
                  </p>
                </Link>

                <Link
                  href="/dashboard/messages"
                  className="p-4 border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <MessageSquare className="h-5 w-5 text-primary mb-2" />
                  <h3 className="font-medium">Messages</h3>
                  <p className="text-sm text-muted-foreground">
                    Chat with gig posters and applicants
                  </p>
                </Link>
              </div>
            </div>

            {/* Recent Applications to Your Gigs */}
            <div className="p-6 bg-card rounded-lg border border-border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Recent Applications</h2>
                <Link
                  href="/dashboard/gigs"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              {recentApplications && recentApplications.length > 0 ? (
                <div className="space-y-3">
                  {recentApplications.map((app) => (
                    <div
                      key={app.id}
                      className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                    >
                      <div>
                        <p className="font-medium">
                          {(app.applicant as { full_name?: string; username: string })?.full_name ||
                            (app.applicant as { username: string })?.username}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Applied to{" "}
                          <Link
                            href={`/gigs/${(app.gig as { id: string })?.id}`}
                            className="text-primary hover:underline"
                          >
                            {(app.gig as { title: string })?.title}
                          </Link>
                        </p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            app.status === "pending"
                              ? "bg-yellow-500/10 text-yellow-600"
                              : app.status === "accepted"
                              ? "bg-green-500/10 text-green-600"
                              : app.status === "rejected"
                              ? "bg-red-500/10 text-red-600"
                              : "bg-blue-500/10 text-blue-600"
                          }`}
                        >
                          {app.status}
                        </span>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(app.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-6">
                  No applications received yet
                </p>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Subscription Status */}
            <div className="p-6 bg-card rounded-lg border border-border">
              <h2 className="text-lg font-semibold mb-4">Subscription</h2>
              {isPro ? (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 bg-primary text-primary-foreground text-xs font-medium rounded">
                      PRO
                    </span>
                    <span className="text-green-600 text-sm">Active</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Renews{" "}
                    {subscription?.current_period_end
                      ? new Date(subscription.current_period_end).toLocaleDateString()
                      : "monthly"}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-muted-foreground mb-3">
                    Upgrade to Pro for unlimited gig posts and premium features.
                  </p>
                  <Link href="/settings/billing">
                    <Button className="w-full">Upgrade to Pro - $5.99/mo</Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Profile Completion */}
            {profile && <ProfileCompletion profile={profile} />}

            {/* Navigation */}
            <div className="p-6 bg-card rounded-lg border border-border">
              <h2 className="text-lg font-semibold mb-4">Navigation</h2>
              <nav className="space-y-2">
                <Link
                  href="/dashboard"
                  className="block p-2 rounded-lg bg-primary/10 text-primary font-medium"
                >
                  Dashboard
                </Link>
                <Link
                  href="/dashboard/gigs"
                  className="block p-2 rounded-lg hover:bg-muted/50 text-muted-foreground"
                >
                  My Gigs
                </Link>
                <Link
                  href="/dashboard/applications"
                  className="block p-2 rounded-lg hover:bg-muted/50 text-muted-foreground"
                >
                  My Applications
                </Link>
                <Link
                  href="/dashboard/messages"
                  className="block p-2 rounded-lg hover:bg-muted/50 text-muted-foreground"
                >
                  Messages
                </Link>
                <Link
                  href="/profile"
                  className="block p-2 rounded-lg hover:bg-muted/50 text-muted-foreground"
                >
                  Edit Profile
                </Link>
                <Link
                  href="/settings/billing"
                  className="block p-2 rounded-lg hover:bg-muted/50 text-muted-foreground"
                >
                  Billing
                </Link>
              </nav>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
