import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/layout/Header";
import {
  MapPin,
  Clock,
  DollarSign,
  Star,
  Briefcase,
  ExternalLink,
  CheckCircle,
} from "lucide-react";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, username, bio")
    .eq("username", username)
    .single();

  if (!profile) {
    return {
      title: "User Not Found | ugig.net",
    };
  }

  return {
    title: `${profile.full_name || profile.username} | ugig.net`,
    description: profile.bio || `View ${profile.username}'s profile on ugig.net`,
  };
}

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      `
      id,
      username,
      full_name,
      avatar_url,
      bio,
      skills,
      ai_tools,
      hourly_rate,
      portfolio_urls,
      location,
      timezone,
      is_available,
      created_at
    `
    )
    .eq("username", username)
    .single();

  if (error || !profile) {
    notFound();
  }

  // Get user's average rating
  const { data: reviews } = await supabase
    .from("reviews")
    .select("rating")
    .eq("reviewee_id", profile.id);

  const averageRating =
    reviews && reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

  // Get completed gigs count
  const { count: completedGigs } = await supabase
    .from("gigs")
    .select("*", { count: "exact", head: true })
    .eq("poster_id", profile.id)
    .eq("status", "filled");

  // Get active gigs by this user
  const { data: activeGigs } = await supabase
    .from("gigs")
    .select("id, title, category, budget_type, budget_min, budget_max, created_at")
    .eq("poster_id", profile.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(3);

  // Get work history
  const { data: workHistory } = await supabase
    .from("work_history")
    .select("*")
    .eq("user_id", profile.id)
    .order("start_date", { ascending: false });

  return (
    <div className="min-h-screen">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Profile Section */}
          <div className="lg:col-span-2 space-y-6">
            {/* Profile Header */}
            <div className="p-6 bg-card rounded-lg border border-border">
              <div className="flex flex-col sm:flex-row gap-6">
                <Avatar className="h-24 w-24 flex-shrink-0">
                  {profile.avatar_url ? (
                    <AvatarImage
                      src={profile.avatar_url}
                      alt={profile.full_name || profile.username}
                    />
                  ) : (
                    <AvatarFallback className="text-3xl">
                      {(profile.full_name || profile.username || "U").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>

                <div className="flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h1 className="text-2xl font-bold">
                        {profile.full_name || profile.username}
                      </h1>
                      <p className="text-muted-foreground">@{profile.username}</p>
                    </div>
                    {profile.is_available && (
                      <Badge variant="default" className="bg-green-600">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Available
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
                    {profile.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {profile.location}
                      </span>
                    )}
                    {profile.timezone && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {profile.timezone}
                      </span>
                    )}
                    {profile.hourly_rate && (
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
                        ${profile.hourly_rate}/hr
                      </span>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex gap-6 mt-4">
                    {averageRating !== null && (
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="font-medium">{averageRating.toFixed(1)}</span>
                        <span className="text-muted-foreground">
                          ({reviews?.length} reviews)
                        </span>
                      </div>
                    )}
                    {(completedGigs ?? 0) > 0 && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Briefcase className="h-4 w-4" />
                        <span>{completedGigs} gigs completed</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Bio */}
            {profile.bio && (
              <div className="p-6 bg-card rounded-lg border border-border">
                <h2 className="text-lg font-semibold mb-3">About</h2>
                <p className="text-muted-foreground whitespace-pre-wrap">{profile.bio}</p>
              </div>
            )}

            {/* Skills */}
            {profile.skills && profile.skills.length > 0 && (
              <div className="p-6 bg-card rounded-lg border border-border">
                <h2 className="text-lg font-semibold mb-3">Skills</h2>
                <div className="flex flex-wrap gap-2">
                  {profile.skills.map((skill: string) => (
                    <Badge key={skill} variant="secondary">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* AI Tools */}
            {profile.ai_tools && profile.ai_tools.length > 0 && (
              <div className="p-6 bg-card rounded-lg border border-border">
                <h2 className="text-lg font-semibold mb-3">AI Tools</h2>
                <div className="flex flex-wrap gap-2">
                  {profile.ai_tools.map((tool: string) => (
                    <Badge key={tool} variant="outline">
                      {tool}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Work History */}
            {workHistory && workHistory.length > 0 && (
              <div className="p-6 bg-card rounded-lg border border-border">
                <h2 className="text-lg font-semibold mb-4">Work History</h2>
                <div className="space-y-4">
                  {workHistory.map((item) => (
                    <div key={item.id} className="border-l-2 border-primary/30 pl-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium">{item.position}</h3>
                        {item.is_current && (
                          <span className="px-2 py-0.5 text-xs bg-green-500/10 text-green-600 rounded">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground">{item.company}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {new Date(item.start_date).toLocaleDateString("en-US", {
                          month: "short",
                          year: "numeric",
                        })}{" "}
                        -{" "}
                        {item.is_current
                          ? "Present"
                          : item.end_date
                          ? new Date(item.end_date).toLocaleDateString("en-US", {
                              month: "short",
                              year: "numeric",
                            })
                          : ""}
                        {item.location && ` · ${item.location}`}
                      </p>
                      {item.description && (
                        <p className="text-sm mt-2 text-muted-foreground">
                          {item.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active Gigs */}
            {activeGigs && activeGigs.length > 0 && (
              <div className="p-6 bg-card rounded-lg border border-border">
                <h2 className="text-lg font-semibold mb-4">Active Gigs</h2>
                <div className="space-y-3">
                  {activeGigs.map((gig) => (
                    <Link
                      key={gig.id}
                      href={`/gigs/${gig.id}`}
                      className="block p-4 border border-border rounded-lg hover:border-primary transition-colors"
                    >
                      <h3 className="font-medium">{gig.title}</h3>
                      <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                        <span>{gig.category}</span>
                        <span>
                          {gig.budget_type === "hourly" ? "Hourly" : "Fixed"}: $
                          {gig.budget_min}
                          {gig.budget_max && gig.budget_max !== gig.budget_min
                            ? ` - $${gig.budget_max}`
                            : ""}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Portfolio Links */}
            {profile.portfolio_urls && profile.portfolio_urls.length > 0 && (
              <div className="p-6 bg-card rounded-lg border border-border">
                <h2 className="text-lg font-semibold mb-4">Portfolio</h2>
                <div className="space-y-2">
                  {profile.portfolio_urls.map((url: string) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-primary hover:underline text-sm"
                    >
                      <ExternalLink className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{new URL(url).hostname}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Member Since */}
            <div className="p-6 bg-card rounded-lg border border-border">
              <h2 className="text-lg font-semibold mb-2">Member Since</h2>
              <p className="text-muted-foreground">
                {new Date(profile.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
