import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ProfileCompletion } from "@/components/profile/ProfileCompletion";
import { Header } from "@/components/layout/Header";
import {
  Briefcase,
  FileText,
  Eye,
  Users,
  TrendingUp,
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
      <Header />

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
          <div className="p-6 bg-card rounded-lg border border-border shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-xl">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalGigs}</p>
                <p className="text-sm text-muted-foreground">Posted Gigs</p>
              </div>
            </div>
          </div>

          <div className="p-6 bg-card rounded-lg border border-border shadow-sm hover:shadow-md hover:border-green-500/30 transition-all duration-200">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/10 rounded-xl">
                <FileText className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalApplications}</p>
                <p className="text-sm text-muted-foreground">Applications Sent</p>
              </div>
            </div>
          </div>

          <div className="p-6 bg-card rounded-lg border border-border shadow-sm hover:shadow-md hover:border-blue-500/30 transition-all duration-200">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/10 rounded-xl">
                <Eye className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalViews}</p>
                <p className="text-sm text-muted-foreground">Gig Views</p>
              </div>
            </div>
          </div>

          <div className="p-6 bg-card rounded-lg border border-border shadow-sm hover:shadow-md hover:border-purple-500/30 transition-all duration-200">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-500/10 rounded-xl">
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
            <div className="p-6 bg-card rounded-lg border border-border shadow-sm">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-border">
                <h2 className="text-lg font-semibold">Quick Actions</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Link
                  href="/gigs/new"
                  className="p-4 border border-border rounded-lg shadow-sm hover:shadow-md hover:border-primary/40 hover:bg-primary/5 transition-all duration-200"
                >
                  <div className="p-2.5 bg-primary/10 rounded-xl w-fit mb-3">
                    <Briefcase className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-medium">Post a New Gig</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Find AI professionals for your project
                  </p>
                </Link>

                <Link
                  href="/gigs"
                  className="p-4 border border-border rounded-lg shadow-sm hover:shadow-md hover:border-primary/40 hover:bg-primary/5 transition-all duration-200"
                >
                  <div className="p-2.5 bg-primary/10 rounded-xl w-fit mb-3">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-medium">Browse Gigs</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Find work opportunities
                  </p>
                </Link>

                <Link
                  href="/dashboard/gigs"
                  className="p-4 border border-border rounded-lg shadow-sm hover:shadow-md hover:border-primary/40 hover:bg-primary/5 transition-all duration-200"
                >
                  <div className="p-2.5 bg-primary/10 rounded-xl w-fit mb-3">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-medium">Manage My Gigs</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    View and edit your posted gigs
                  </p>
                </Link>

                <Link
                  href="/dashboard/applications"
                  className="p-4 border border-border rounded-lg shadow-sm hover:shadow-md hover:border-primary/40 hover:bg-primary/5 transition-all duration-200"
                >
                  <div className="p-2.5 bg-primary/10 rounded-xl w-fit mb-3">
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-medium">My Applications</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Track your job applications
                  </p>
                </Link>

                <Link
                  href="/dashboard/messages"
                  className="p-4 border border-border rounded-lg shadow-sm hover:shadow-md hover:border-primary/40 hover:bg-primary/5 transition-all duration-200"
                >
                  <div className="p-2.5 bg-primary/10 rounded-xl w-fit mb-3">
                    <MessageSquare className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-medium">Messages</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Chat with gig posters and applicants
                  </p>
                </Link>
              </div>
            </div>

            {/* Recent Applications to Your Gigs */}
            <div className="p-6 bg-card rounded-lg border border-border shadow-sm">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-border">
                <h2 className="text-lg font-semibold">Recent Applications</h2>
                <Link
                  href="/dashboard/gigs"
                  className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                >
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              {recentApplications && recentApplications.length > 0 ? (
                <div className="space-y-3">
                  {recentApplications.map((app) => (
                    <div
                      key={app.id}
                      className="flex items-center justify-between p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
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
                          className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${
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
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {new Date(app.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">
                    No applications received yet
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Subscription Status */}
            <div className="p-6 bg-card rounded-lg border border-border shadow-sm">
              <div className="pb-3 mb-4 border-b border-border">
                <h2 className="text-lg font-semibold">Subscription</h2>
              </div>
              {isPro ? (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2.5 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-md">
                      PRO
                    </span>
                    <span className="text-green-600 text-sm font-medium">Active</span>
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
                  <p className="text-muted-foreground mb-4">
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
            <div className="p-6 bg-card rounded-lg border border-border shadow-sm">
              <div className="pb-3 mb-4 border-b border-border">
                <h2 className="text-lg font-semibold">Navigation</h2>
              </div>
              <nav className="space-y-1">
                <Link
                  href="/dashboard"
                  className="block p-2.5 pl-3 rounded-lg bg-primary/10 text-primary font-medium border-l-2 border-primary transition-all duration-150"
                >
                  Dashboard
                </Link>
                <Link
                  href="/dashboard/gigs"
                  className="block p-2.5 pl-3 rounded-lg hover:bg-muted/50 text-muted-foreground border-l-2 border-transparent hover:border-muted-foreground/30 transition-all duration-150"
                >
                  My Gigs
                </Link>
                <Link
                  href="/dashboard/applications"
                  className="block p-2.5 pl-3 rounded-lg hover:bg-muted/50 text-muted-foreground border-l-2 border-transparent hover:border-muted-foreground/30 transition-all duration-150"
                >
                  My Applications
                </Link>
                <Link
                  href="/dashboard/messages"
                  className="block p-2.5 pl-3 rounded-lg hover:bg-muted/50 text-muted-foreground border-l-2 border-transparent hover:border-muted-foreground/30 transition-all duration-150"
                >
                  Messages
                </Link>
                <Link
                  href="/dashboard/notifications"
                  className="block p-2.5 pl-3 rounded-lg hover:bg-muted/50 text-muted-foreground border-l-2 border-transparent hover:border-muted-foreground/30 transition-all duration-150"
                >
                  Notifications
                </Link>
                <Link
                  href="/profile"
                  className="block p-2.5 pl-3 rounded-lg hover:bg-muted/50 text-muted-foreground border-l-2 border-transparent hover:border-muted-foreground/30 transition-all duration-150"
                >
                  Edit Profile
                </Link>
                <Link
                  href="/settings/billing"
                  className="block p-2.5 pl-3 rounded-lg hover:bg-muted/50 text-muted-foreground border-l-2 border-transparent hover:border-muted-foreground/30 transition-all duration-150"
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
