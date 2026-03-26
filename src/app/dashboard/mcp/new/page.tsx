import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { McpListingForm } from "@/components/mcp/McpListingForm";

export const metadata = {
  title: "Create MCP Server Listing | ugig.net",
  description: "Publish a new MCP server on the marketplace",
};

export default async function NewMcpPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard/mcp/new");
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Create MCP Server Listing</h1>
        <p className="text-muted-foreground mb-8">
          Publish an MCP server to the marketplace.
        </p>
        <McpListingForm />
      </div>
    </main>
  );
}
