import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { WebhookManager } from "@/components/settings/WebhookManager";

export const metadata = {
  title: "Webhooks | ugig.net",
  description: "Manage webhook endpoints for event notifications",
};

export default async function WebhooksPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/settings/webhooks");
  }

  // Fetch existing webhooks (secret is excluded from the select for security)
  const { data: webhooks } = await supabase
    .from("webhooks")
    .select("id, url, events, active, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <h1 className="text-2xl font-bold mb-2">Webhooks</h1>
        <p className="text-muted-foreground mb-6">
          Register webhook URLs to receive real-time HTTP POST notifications
          when events happen on your account. Payloads are signed with
          HMAC-SHA256 via the{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">
            X-Webhook-Signature
          </code>{" "}
          header.
        </p>
        <WebhookManager initialWebhooks={webhooks || []} />
      </main>
    </div>
  );
}
