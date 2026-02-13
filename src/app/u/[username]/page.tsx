import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  Clock,
  DollarSign,
  Star,
  Briefcase,
  ExternalLink,
  CheckCircle,
  Download,
  Wallet,
  Bot,
  Globe,
  Code,
  Tag,
  MessageSquare,
} from "lucide-react";
import { WALLET_CURRENCIES, type WalletAddress } from "@/types";
import { AgentBadge } from "@/components/ui/AgentBadge";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { EmailVerifiedBadge } from "@/components/ui/EmailVerifiedBadge";
import { ReputationBadge } from "@/components/ui/ReputationBadge";
import { StartConversationButton } from "@/components/messages/StartConversationButton";
import { ProfileTabs } from "@/components/activity/ProfileTabs";
import { FollowButton } from "@/components/follow/FollowButton";
import { FollowCounts } from "@/components/follow/FollowCounts";
import { SkillEndorsements } from "@/components/endorsements";

interface Props {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string }>;
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

export default async function PublicProfilePage({ params, searchParams }: Props) {
  const { username } = await params;
  const { tab } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();

  // Parse wallet addresses
  const parseWalletAddresses = (data: unknown): WalletAddress[] => {
    if (!data) return [];
    if (Array.isArray(data)) {
      return data.filter(
        (w): w is WalletAddress =>
          typeof w === "object" &&
          w !== null &&
          "currency" in w &&
          "address" in w
      );
    }
    return [];
  };

  const walletAddresses = parseWalletAddresses(profile?.wallet_addresses);

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
    .select("id, title, category, budget_type, budget_min, budget_max, budget_unit, payment_coin, created_at")
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
            {/* Banner Image */}
            <div className="relative w-full h-[200px] sm:h-[250px] rounded-lg overflow-hidden border border-border">
              {profile.banner_url ? (
                <Image
                  src={profile.banner_url}
                  alt={`${profile.full_name || profile.username}'s banner`}
                  fill
                  sizes="(max-width: 1024px) 100vw, 66vw"
                  className="object-cover"
                  priority
                  unoptimized
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/20 via-primary/10 to-muted" />
              )}
            </div>

            {/* Profile Header */}
            <div className="p-6 bg-card rounded-lg border border-border">
              <div className="flex flex-col sm:flex-row gap-6">
                <Image
                  src={profile.avatar_url || "/default-avatar.svg"}
                  alt={profile.full_name || profile.username || "User"}
                  width={96}
                  height={96}
                  className="h-24 w-24 rounded-full object-cover flex-shrink-0"
                />

                <div className="flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h1 className="text-2xl font-bold flex items-center gap-1.5">
                        {profile.full_name || profile.username}
                        {!!(profile as Record<string, unknown>).email_confirmed_at && (
                          <EmailVerifiedBadge size="default" />
                        )}
                        {profile.verified && (
                          <VerifiedBadge
                            verificationType={profile.verification_type}
                            size="lg"
                          />
                        )}
                      </h1>
                      <p className="text-muted-foreground">@{profile.username}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {profile.account_type === "agent" && (
                        <AgentBadge
                          agentName={profile.agent_name}
                          operatorUrl={profile.agent_operator_url}
                        />
                      )}
                      {profile.is_available && (
                        <Badge variant="default" className="bg-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Available
                        </Badge>
                      )}
                      {currentUser && currentUser.id !== profile.id && (
                        <>
                          <FollowButton username={profile.username} />
                          <StartConversationButton
                            recipientId={profile.id}
                            variant="outline"
                            size="sm"
                          />
                        </>
                      )}
                      {!currentUser && (
                        <Link href={`/login?redirect=/u/${username}`}>
                          <Button variant="outline" size="sm">
                            <MessageSquare className="h-4 w-4 mr-1" />
                            Message
                          </Button>
                        </Link>
                      )}
                    </div>
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

                  {/* Follow Counts */}
                  <div className="mt-3">
                    <FollowCounts
                      username={profile.username}
                      followersCount={profile.followers_count ?? 0}
                      followingCount={profile.following_count ?? 0}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Agent Info */}
            {profile.account_type === "agent" && (
              <div className="p-6 bg-card rounded-lg border border-purple-200 dark:border-purple-800/50 bg-purple-50/50 dark:bg-purple-900/10">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Bot className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  Agent Information
                </h2>
                <div className="space-y-2 text-sm">
                  {profile.agent_name && (
                    <p>
                      <span className="text-muted-foreground">Name:</span>{" "}
                      <span className="font-medium">{profile.agent_name}</span>
                    </p>
                  )}
                  {profile.agent_description && (
                    <p className="text-muted-foreground">{profile.agent_description}</p>
                  )}
                  <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-purple-200 dark:border-purple-800/50">
                    {profile.agent_version && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Tag className="h-3.5 w-3.5" />
                        v{profile.agent_version}
                      </span>
                    )}
                    {profile.agent_operator_url && (
                      <a
                        href={profile.agent_operator_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        <Globe className="h-3.5 w-3.5" />
                        Operator
                      </a>
                    )}
                    {profile.agent_source_url && (
                      <a
                        href={profile.agent_source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        <Code className="h-3.5 w-3.5" />
                        Source / Docs
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Profile / Activity / Portfolio Tabs */}
            <ProfileTabs
              username={username}
              userId={profile.id}
              isOwnProfile={currentUser?.id === profile.id}
              defaultTab={tab || "profile"}
            >
              {/* Profile Content */}
              <div className="space-y-6" data-tab="profile">
                {/* Bio */}
                {profile.bio && (
                  <div className="p-6 bg-card rounded-lg border border-border">
                    <h2 className="text-lg font-semibold mb-3">About</h2>
                    <p className="text-muted-foreground whitespace-pre-wrap">{profile.bio}</p>
                  </div>
                )}

                {/* Skills with Endorsements */}
                {profile.skills && profile.skills.length > 0 && (
                  <SkillEndorsements
                    username={profile.username}
                    skills={profile.skills}
                    isOwnProfile={currentUser?.id === profile.id}
                    currentUserId={currentUser?.id}
                  />
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
                              {gig.budget_type === "revenue_share"
                                ? `${gig.budget_min || 0}${gig.budget_max && gig.budget_max !== gig.budget_min ? `-${gig.budget_max}` : ""}% rev share`
                                : `${gig.budget_type === "hourly" ? "Hourly" :
                                    gig.budget_type === "per_task" ? `Per ${gig.budget_unit || "task"}` :
                                    gig.budget_type === "per_unit" ? `Per ${gig.budget_unit || "unit"}` :
                                    "Fixed"}: $${gig.budget_min || 0}${gig.budget_max && gig.budget_max !== gig.budget_min ? ` - $${gig.budget_max}` : ""}${gig.payment_coin ? ` ${gig.payment_coin}` : ""}`
                              }
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ProfileTabs>
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

            {/* Resume Download */}
            {profile.resume_url && (
              <div className="p-6 bg-card rounded-lg border border-border">
                <h2 className="text-lg font-semibold mb-4">Resume</h2>
                <a
                  href={profile.resume_url}
                  download={profile.resume_filename || "resume.pdf"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Download Resume
                  </Button>
                </a>
                {profile.resume_filename && (
                  <p className="text-xs text-muted-foreground mt-2 text-center truncate">
                    {profile.resume_filename}
                  </p>
                )}
              </div>
            )}

            {/* Wallet Addresses */}
            {walletAddresses.length > 0 && (
              <div className="p-6 bg-card rounded-lg border border-border">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Payment Wallets
                </h2>
                <div className="space-y-3">
                  {walletAddresses
                    .sort((a, b) => (b.is_preferred ? 1 : 0) - (a.is_preferred ? 1 : 0))
                    .map((wallet) => {
                      const currencyInfo = WALLET_CURRENCIES.find(
                        (c) => c.id === wallet.currency
                      );
                      return (
                        <div
                          key={wallet.currency}
                          className={`p-3 rounded-lg border ${
                            wallet.is_preferred
                              ? "border-primary bg-primary/5"
                              : "border-border bg-muted/30"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">
                              {currencyInfo?.name || wallet.currency}
                            </span>
                            {wallet.is_preferred && (
                              <Badge variant="default" className="text-xs">
                                <Star className="h-3 w-3 mr-1 fill-current" />
                                Preferred
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono break-all">
                            {wallet.address}
                          </p>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* DID / Reputation */}
            {profile.did && (
              <div className="p-6 bg-card rounded-lg border border-border">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold">Decentralized Identity</h2>
                  <ReputationBadge did={profile.did} size="md" />
                </div>
                <p className="text-xs text-muted-foreground font-mono break-all mb-3">
                  {profile.did}
                </p>
                <a
                  href={`https://coinpayportal.com/reputation?did=${encodeURIComponent(profile.did)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  View Reputation →
                </a>
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

            {/* Contact CTA */}
            {profile.id !== currentUser?.id && (
              <div className="p-6 bg-card rounded-lg border border-border">
                <h2 className="text-lg font-semibold mb-3">Contact</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Send a direct message to {profile.full_name || profile.username}
                </p>
                {currentUser ? (
                  <StartConversationButton recipientId={profile.id} variant="default" size="default" className="w-full" />
                ) : (
                  <Link href={`/login?redirect=/u/${username}`}>
                    <Button variant="default" className="w-full"><MessageSquare className="h-4 w-4 mr-2" />Message</Button>
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
