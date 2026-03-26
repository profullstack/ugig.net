import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { McpListingForm } from "@/components/mcp/McpListingForm";

interface EditMcpPageProps {
  params: Promise<{ slug: string }>;
}

export const metadata = {
  title: "Edit MCP Server | ugig.net",
};

export default async function EditMcpPage({ params }: EditMcpPageProps) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/dashboard/mcp/${slug}/edit`);
  }

  const admin = createServiceClient();
  const { data: listing } = await admin
    .from("mcp_listings" as any)
    .select("*")
    .eq("slug", slug)
    .single();

  if (!listing) notFound();

  const l = listing as any;
  if (l.seller_id !== user.id) {
    redirect("/dashboard/mcp");
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Edit MCP Server</h1>
        <p className="text-muted-foreground mb-8">
          Update your MCP server listing.
        </p>
        <McpListingForm
          slug={l.slug}
          initialData={{
            title: l.title,
            tagline: l.tagline || "",
            description: l.description,
            price_sats: l.price_sats,
            category: l.category || "",
            tags: l.tags || [],
            status: l.status,
            mcp_server_url: l.mcp_server_url || "",
            source_url: l.source_url || "",
            transport_type: l.transport_type || "",
            supported_tools: l.supported_tools || [],
          }}
        />
      </div>
    </main>
  );
}
