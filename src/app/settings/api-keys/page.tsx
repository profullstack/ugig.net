import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { ApiKeyManager } from "@/components/settings/ApiKeyManager";

export const metadata = {
  title: "API Keys | ugig.net",
  description: "Manage your API keys for programmatic access",
};

export default async function ApiKeysPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/settings/api-keys");
  }

  // Fetch existing API keys
  const { data: keys } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, last_used_at, expires_at, created_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <h1 className="text-2xl font-bold mb-2">API Keys</h1>
        <p className="text-muted-foreground mb-6">
          Create and manage API keys for programmatic access to ugig.net.
          Keys are used with the <code className="text-sm bg-muted px-1.5 py-0.5 rounded">Authorization: Bearer</code> header.
        </p>
        <ApiKeyManager initialKeys={keys || []} />
      </main>
    </div>
  );
}
