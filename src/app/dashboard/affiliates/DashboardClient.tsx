"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SatsFiatHint } from "@/components/ui/SatsAmount";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Megaphone,
  MousePointerClick,
  TrendingUp,
  Zap,
  Clock,
  Users,
  Plus,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";

interface AffiliateStats {
  total_clicks_30d: number;
  total_conversions: number;
  total_earned_sats: number;
  total_pending_sats: number;
  active_offers: number;
}

interface SellerStats {
  total_offers: number;
  total_revenue_sats: number;
  total_commissions_sats: number;
  total_affiliates: number;
}

function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1)}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1)}K`;
  return sats.toLocaleString();
}

function StatCard({
  label,
  value,
  suffix,
  icon: Icon,
  color = "primary",
}: {
  label: string;
  value: string | number;
  suffix?: string;
  icon: React.ElementType;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary hover:border-primary/30",
    green: "bg-green-500/10 text-green-500 hover:border-green-500/30",
    amber: "bg-amber-500/10 text-amber-500 hover:border-amber-500/30",
    blue: "bg-blue-500/10 text-blue-500 hover:border-blue-500/30",
    purple: "bg-purple-500/10 text-purple-500 hover:border-purple-500/30",
  };
  const classes = colorMap[color] || colorMap.primary;
  const [bgIcon, textIcon, hoverBorder] = classes.split(" ");

  return (
    <div
      className={`p-6 bg-card rounded-lg border border-border shadow-sm hover:shadow-md ${hoverBorder} transition-all duration-200`}
    >
      <div className="flex items-center gap-4">
        <div className={`p-3 ${bgIcon} rounded-xl`}>
          <Icon className={`h-5 w-5 ${textIcon}`} />
        </div>
        <div>
          <p className="text-2xl font-bold">
            {value}
            {suffix && (
              <span className="text-sm font-normal text-muted-foreground ml-1">
                {suffix}
              </span>
            )}
            {suffix === "sats" && typeof value === "string" && (
              <span className="text-sm font-normal ml-1">
                <SatsFiatHint sats={parseInt(value.replace(/,/g, "")) || 0} />
              </span>
            )}
          </p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

function CopyButton({ text, label, stopPropagation }: { text: string; label?: string; stopPropagation?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      title={label}
      onClick={(e) => {
        if (stopPropagation) e.preventDefault();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 mr-1" />
          <span className="text-xs">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5 mr-1" />
          {label && <span className="text-xs">{label}</span>}
        </>
      )}
    </Button>
  );
}

export default function AffiliateDashboardClient() {
  const router = useRouter();
  const [affData, setAffData] = useState<any>(null);
  const [sellerData, setSellerData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("affiliate");

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) {
          router.replace("/login?redirect=/dashboard/affiliates");
          return;
        }
        return Promise.all([
          fetch("/api/affiliates/my?view=affiliate").then((r) => r.json()),
          fetch("/api/affiliates/my?view=seller").then((r) => r.json()),
        ]).then(([aff, seller]) => {
          setAffData(aff);
          setSellerData(seller);
          setLoading(false);
        });
      })
      .catch(() => router.replace("/login?redirect=/dashboard/affiliates"));
  }, [router]);

  if (loading) {
    return (
      <main className="container mx-auto px-4 py-8">
        <p className="text-muted-foreground">Loading dashboard...</p>
      </main>
    );
  }

  const affStats: AffiliateStats = affData?.stats || {};
  const sellerStats: SellerStats = sellerData?.stats || {};

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Affiliate Dashboard</h1>
            <p className="text-muted-foreground">
              Manage your affiliate programs and offers
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/affiliates">
              <Button variant="outline" size="sm">
                <ExternalLink className="h-4 w-4 mr-2" />
                Marketplace
              </Button>
            </Link>
            <Link href="/affiliates/new">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Create Offer
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="affiliate">As Affiliate</TabsTrigger>
          <TabsTrigger value="seller">As Seller</TabsTrigger>
        </TabsList>

        {/* Affiliate view */}
        <TabsContent value="affiliate">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <StatCard
              label="Active Offers"
              value={affStats.active_offers || 0}
              icon={Megaphone}
              color="primary"
            />
            <StatCard
              label="Clicks (30d)"
              value={affStats.total_clicks_30d || 0}
              icon={MousePointerClick}
              color="blue"
            />
            <StatCard
              label="Conversions"
              value={affStats.total_conversions || 0}
              icon={TrendingUp}
              color="green"
            />
            <StatCard
              label="Earned"
              value={formatSats(affStats.total_earned_sats || 0)}
              suffix="sats"
              icon={Zap}
              color="amber"
            />
            <StatCard
              label="Pending"
              value={formatSats(affStats.total_pending_sats || 0)}
              suffix="sats"
              icon={Clock}
              color="purple"
            />
          </div>

          <h2 className="text-xl font-semibold mb-4">My Offers</h2>
          {(affData?.applications || []).length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-lg">
              <Megaphone className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground mb-4">
                You haven&apos;t joined any affiliate programs yet
              </p>
              <Link href="/affiliates">
                <Button>Browse Offers</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3 mb-8">
              {affData.applications.map((app: any) => (
                <div
                  key={app.id}
                  className="bg-card border border-border rounded-lg p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/affiliates/${app.affiliate_offers?.slug || ""}`}
                        className="font-medium hover:underline"
                      >
                        {app.affiliate_offers?.title || "Unknown"}
                      </Link>
                      <Badge
                        variant={
                          app.status === "approved" ? "default" : "secondary"
                        }
                      >
                        {app.status}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {app.affiliate_offers?.commission_type === "flat"
                        ? `${formatSats(app.affiliate_offers?.commission_flat_sats || 0)} sats/sale`
                        : `${Math.round((app.affiliate_offers?.commission_rate || 0) * 100)}% commission`}
                      {app.affiliate_offers?.profiles?.username && (
                        <> · by @{app.affiliate_offers.profiles.username}</>
                      )}
                    </div>
                  </div>
                  {app.status === "approved" && (
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono max-w-[200px] truncate">
                        {app.tracking_code}
                      </code>
                      <CopyButton
                        text={`${window.location.origin}/api/affiliates/click?ugig_ref=${app.tracking_code}`}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {(affData?.conversions || []).length > 0 && (
            <>
              <h2 className="text-xl font-semibold mb-4">
                Recent Conversions
              </h2>
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Offer</th>
                      <th className="text-right p-3 font-medium">Sale</th>
                      <th className="text-right p-3 font-medium">
                        Commission
                      </th>
                      <th className="text-center p-3 font-medium">Status</th>
                      <th className="text-right p-3 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {affData.conversions.map((conv: any) => (
                      <tr key={conv.id} className="border-t border-border">
                        <td className="p-3">
                          {conv.affiliate_offers?.title || "—"}
                        </td>
                        <td className="text-right p-3">
                          {formatSats(conv.sale_amount_sats)} sats
                        </td>
                        <td className="text-right p-3 font-medium text-amber-500">
                          <span className="inline-flex items-center gap-1">
                            <Zap className="h-3 w-3 fill-amber-500" />
                            {formatSats(conv.commission_sats)} sats
                          </span>
                        </td>
                        <td className="text-center p-3">
                          <Badge
                            variant={
                              conv.status === "paid" ? "default" : "secondary"
                            }
                          >
                            {conv.status}
                          </Badge>
                        </td>
                        <td className="text-right p-3 text-muted-foreground">
                          {new Date(conv.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>

        {/* Seller view */}
        <TabsContent value="seller">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Offers"
              value={sellerStats.total_offers || 0}
              icon={Megaphone}
              color="primary"
            />
            <StatCard
              label="Affiliates"
              value={sellerStats.total_affiliates || 0}
              icon={Users}
              color="blue"
            />
            <StatCard
              label="Revenue"
              value={formatSats(sellerStats.total_revenue_sats || 0)}
              suffix="sats"
              icon={TrendingUp}
              color="green"
            />
            <StatCard
              label="Commissions Paid"
              value={formatSats(sellerStats.total_commissions_sats || 0)}
              suffix="sats"
              icon={Zap}
              color="amber"
            />
          </div>

          <h2 className="text-xl font-semibold mb-4">My Offers</h2>
          {(sellerData?.offers || []).length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-lg">
              <Plus className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground mb-4">
                You haven&apos;t created any affiliate offers yet
              </p>
              <Link href="/affiliates/new">
                <Button>Create an Offer</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {sellerData.offers.map((offer: any) => (
                <Link
                  key={offer.id}
                  href={`/dashboard/affiliates/${offer.id}`}
                  className="block bg-card border border-border rounded-lg p-4 hover:shadow-md hover:border-primary/30 transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{offer.title}</span>
                        <Badge
                          variant={
                            offer.status === "active" ? "default" : "secondary"
                          }
                        >
                          {offer.status}
                        </Badge>
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {offer.total_affiliates || 0}
                        </Badge>
                        {(offer.total_conversions || 0) > 0 && (
                          <Badge variant="outline" className="flex items-center gap-1 text-green-500 border-green-500/30">
                            <TrendingUp className="h-3 w-3" />
                            {offer.total_conversions} sales
                          </Badge>
                        )}
                        {(offer.total_clicks || 0) > 0 && (
                          <Badge variant="outline" className="flex items-center gap-1 text-muted-foreground">
                            <MousePointerClick className="h-3 w-3" />
                            {offer.total_clicks} clicks
                            {offer.total_conversions > 0 && (
                              <span className="text-primary ml-0.5">
                                ({((offer.total_conversions / offer.total_clicks) * 100).toFixed(1)}%)
                              </span>
                            )}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {offer.commission_type === "flat"
                          ? `${formatSats(offer.commission_flat_sats || 0)} sats/sale`
                          : `${Math.round(offer.commission_rate * 100)}% commission`}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <CopyButton
                        text={`${window.location.origin}/affiliates/${offer.slug}`}
                        label="Share"
                        stopPropagation
                      />
                      <div className="text-right">
                        <div className="font-medium text-amber-500 flex items-center gap-1">
                          <Zap className="h-4 w-4 fill-amber-500" />
                          {formatSats(offer.total_revenue_sats || 0)} sats
                        </div>
                        <div className="text-xs text-muted-foreground">
                          revenue
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}
