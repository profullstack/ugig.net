import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Server,
  Plus,
  Star,
  Download,
  Zap,
  TrendingUp,
  Pencil,
} from "lucide-react";

export const metadata = {
  title: "My MCP Servers | ugig.net",
  description: "Manage your MCP server listings",
};

export default async function SellerMcpPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard/mcp");
  }

  const admin = createServiceClient();

  const { data: listings } = await admin
    .from("mcp_listings" as any)
    .select("*")
    .eq("seller_id", user.id)
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  // Sales stats
  const { data: sales } = await admin
    .from("mcp_purchases" as any)
    .select("price_sats, fee_sats")
    .eq("seller_id", user.id);

  const totalSales = sales?.length || 0;
  const totalRevenue = (sales || []).reduce(
    (sum: number, s: any) => sum + (s.price_sats - s.fee_sats),
    0
  );

  return (
    <div>
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold">My MCP Servers</h1>
            <Link href="/dashboard/mcp/new">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New MCP Server
              </Button>
            </Link>
          </div>
          <p className="text-muted-foreground mb-8">
            Manage your MCP server listings on the marketplace.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="p-5 bg-card rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary/10 rounded-xl">
                  <Server className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{listings?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">Listed Servers</p>
                </div>
              </div>
            </div>
            <div className="p-5 bg-card rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-green-500/10 rounded-xl">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalSales}</p>
                  <p className="text-sm text-muted-foreground">Total Sales</p>
                </div>
              </div>
            </div>
            <div className="p-5 bg-card rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 rounded-xl">
                  <Zap className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold flex items-center gap-1">
                    {totalRevenue.toLocaleString()}
                    <span className="text-sm font-normal text-muted-foreground">
                      sats
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">Revenue</p>
                </div>
              </div>
            </div>
          </div>

          {/* Listings */}
          {!listings || listings.length === 0 ? (
            <div className="text-center py-12 bg-muted/30 rounded-lg">
              <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                You haven&apos;t created any MCP servers yet.
              </p>
              <Link href="/dashboard/mcp/new">
                <Button>Create Your First MCP Server</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {(listings as any[]).map((listing) => (
                <div
                  key={listing.id}
                  className="flex items-center gap-4 p-4 border border-border rounded-lg bg-card"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link
                        href={`/mcp/${listing.slug}`}
                        className="font-semibold hover:text-primary transition-colors truncate"
                      >
                        {listing.title}
                      </Link>
                      <Badge
                        variant={
                          listing.status === "active" ? "default" : "secondary"
                        }
                        className="capitalize shrink-0"
                      >
                        {listing.status}
                      </Badge>
                      {listing.transport_type && (
                        <span className="text-xs px-1.5 py-0.5 bg-blue-500/10 text-blue-600 rounded shrink-0">
                          {listing.transport_type}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {listing.price_sats === 0 ? (
                        <span>Free</span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          {listing.price_sats.toLocaleString()} sats
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Download className="h-3 w-3" />
                        {listing.downloads_count}
                      </span>
                      {listing.rating_count > 0 && (
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                          {Number(listing.rating_avg).toFixed(1)} (
                          {listing.rating_count})
                        </span>
                      )}
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/mcp/${listing.slug}/edit`}
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
