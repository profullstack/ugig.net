import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  MapPin,
  Clock,
  DollarSign,
  Briefcase,
  ArrowLeft,
  Users,
  Eye,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatRelativeTime, formatDate } from "@/lib/utils";
import { Header } from "@/components/layout/Header";
import { GigComments } from "@/components/gigs/GigComments";
import { AddToPortfolioPrompt } from "@/components/portfolio/AddToPortfolioPrompt";
import { EscrowBadge } from "@/components/gigs/EscrowBadge";

interface GigPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: GigPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: gig } = await supabase
    .from("gigs")
    .select("title, description")
    .eq("id", id)
    .single();

  if (!gig) {
    return { title: "Gig Not Found | ugig.net" };
  }

  return {
    title: `${gig.title} | ugig.net`,
    description: gig.description.slice(0, 160),
  };
}

export default async function GigPage({ params }: GigPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: gig, error } = await supabase
    .from("gigs")
    .select(
      `
      *,
      poster:profiles!poster_id (
        id,
        username,
        full_name,
        avatar_url,
        bio,
        skills,
        ai_tools,
        is_available,
        created_at
      )
    `
    )
    .eq("id", id)
    .single();

  if (error || !gig) {
    notFound();
  }

  // Normalize poster - Supabase can return array or object depending on relation config
  const poster = Array.isArray(gig.poster) ? gig.poster[0] : gig.poster;

  // Increment view count (fire and forget)
  supabase
    .from("gigs")
    .update({ views_count: gig.views_count + 1 })
    .eq("id", id)
    .then();

  // Get current user to check if they can apply
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isOwner = user?.id === gig.poster_id;

  // Check if already applied
  let hasApplied = false;
  if (user && !isOwner) {
    const { data: existingApp } = await supabase
      .from("applications")
      .select("id")
      .eq("gig_id", id)
      .eq("applicant_id", user.id)
      .single();
    hasApplied = !!existingApp;
  }

  const getBudgetDisplay = () => {
    const unit = gig.budget_unit;
    const min = gig.budget_min;
    const max = gig.budget_max;

    const suffix = (() => {
      switch (gig.budget_type) {
        case "hourly": return "/hr";
        case "daily": return "/day";
        case "weekly": return "/wk";
        case "monthly": return "/mo";
        case "per_task": return unit ? `/${unit}` : "/task";
        case "per_unit": return unit ? `/${unit}` : "/unit";
        case "revenue_share": return "% rev share";
        default: return "";
      }
    })();

    const coin = gig.payment_coin ? ` ${gig.payment_coin}` : "";

    if (gig.budget_type === "revenue_share") {
      if (min && max) return `${min}-${max}${suffix}`;
      if (min) return `${min}${suffix}`;
      return "Rev Share TBD";
    }

    if (min && max) return `${formatCurrency(min)} - ${formatCurrency(max)}${coin}${suffix}`;
    if (min) return `${formatCurrency(min)}+${coin}${suffix}`;
    return gig.budget_type === "fixed" ? "Budget TBD" : "Rate TBD";
  };

  const budgetDisplay = getBudgetDisplay();

  return (
    <div className="min-h-screen">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <Link
          href="/gigs"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to gigs
        </Link>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Title & Meta */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge>{gig.category}</Badge>
                <Badge variant="outline">
                  {gig.location_type.charAt(0).toUpperCase() +
                    gig.location_type.slice(1)}
                </Badge>
              </div>
              <h1 className="text-3xl font-bold mb-4">{gig.title}</h1>
              <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Posted {formatRelativeTime(gig.created_at)}
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  {gig.views_count} views
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {gig.applications_count} applications
                </span>
              </div>
            </div>

            {/* Auto-suggest: Add to Portfolio when gig is completed */}
            {isOwner && gig.status === "filled" && (
              <AddToPortfolioPrompt gigId={id} gigTitle={gig.title} />
            )}

            {/* Description */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Description</h2>
              <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
                {gig.description}
              </div>
            </div>

            {/* Skills Required */}
            {gig.skills_required.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Required Skills</h2>
                <div className="flex flex-wrap gap-2">
                  {gig.skills_required.map((skill) => (
                    <Badge key={skill} variant="secondary">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* AI Tools */}
            {gig.ai_tools_preferred.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-4">
                  Preferred AI Tools
                </h2>
                <div className="flex flex-wrap gap-2">
                  {gig.ai_tools_preferred.map((tool) => (
                    <Badge key={tool} variant="outline">
                      {tool}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Q&A Comments */}
            <GigComments
              gigId={id}
              currentUserId={user?.id}
              gigOwnerId={gig.poster_id}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Apply Card */}
            <div className="border border-border rounded-lg p-6 bg-card">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  <span className="text-2xl font-bold">{budgetDisplay}</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="capitalize">{gig.budget_type.replace("_", " ")}</span> rate{gig.budget_unit ? ` (per ${gig.budget_unit})` : ""}{gig.payment_coin ? ` · Paid in ${gig.payment_coin}` : ""}
                </div>

                {gig.duration && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Briefcase className="h-4 w-4" />
                    <span>{gig.duration}</span>
                  </div>
                )}

                {gig.location && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{gig.location}</span>
                  </div>
                )}

                {gig.status === "active" && !isOwner && (
                  <>
                    {user ? (
                      hasApplied ? (
                        <Button disabled className="w-full">
                          Already Applied
                        </Button>
                      ) : (
                        <Link href={`/gigs/${id}/apply`} className="block">
                          <Button className="w-full">Apply Now</Button>
                        </Link>
                      )
                    ) : (
                      <Link href={`/login?redirect=/gigs/${id}`} className="block">
                        <Button className="w-full">Log in to Apply</Button>
                      </Link>
                    )}
                  </>
                )}

                {isOwner && (
                  <div className="space-y-2">
                    <Link href={`/gigs/${id}/edit`} className="block">
                      <Button variant="outline" className="w-full">
                        Edit Gig
                      </Button>
                    </Link>
                    <Link href={`/gigs/${id}/applications`} className="block">
                      <Button className="w-full">
                        View Applications ({gig.applications_count})
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Poster Info */}
            {poster && (
              <div className="border border-border rounded-lg p-6 bg-card">
                <h3 className="font-semibold mb-4">Posted by</h3>
                <Link
                  href={`/u/${poster.username}`}
                  className="flex items-center gap-3 hover:opacity-80"
                >
                  <Image
                    src={poster.avatar_url || "/default-avatar.svg"}
                    alt={poster.full_name || poster.username || "User"}
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                  <div>
                    <p className="font-medium">
                      {poster.full_name || poster.username}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      @{poster.username}
                    </p>
                  </div>
                </Link>
                {poster.bio && (
                  <p className="text-sm text-muted-foreground mt-4 line-clamp-3">
                    {poster.bio}
                  </p>
                )}
                <p className="text-sm text-muted-foreground mt-4">
                  Member since {formatDate(poster.created_at)}
                </p>
              </div>
            )}

            {/* Escrow Services */}
            <EscrowBadge variant="compact" />
          </div>
        </div>
      </main>
    </div>
  );
}
