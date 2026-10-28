import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { WebhookManager, type WebhookEndpoint } from "@/components/settings/WebhookManager";
import { getHooks } from "@/lib/webhooks/hub";

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

  // Secrets are never part of a listed endpoint.
  let webhooks: WebhookEndpoint[] = [];
  try {
    webhooks = (await getHooks().listEndpoints(user.id)).sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
  } catch (err) {
    console.error("[settings/webhooks]", err);
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <h1 className="text-2xl font-bold mb-2">Webhooks</h1>
        <p className="text-muted-foreground mb-6">
          Register webhook URLs to receive real-time HTTP POST notifications
          when events happen on your account. Each delivery is a CloudEvents
          JSON body signed per{" "}
          <a href="https://www.standardwebhooks.com/" className="underline" target="_blank" rel="noreferrer">
            Standard Webhooks
          </a>{" "}
          (<code className="text-sm bg-muted px-1.5 py-0.5 rounded">webhook-id</code>,{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">webhook-timestamp</code>,{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">webhook-signature</code>), and still
          carries the{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">X-Webhook-Signature</code>{" "}
          HMAC-SHA256 header. Failed deliveries are retried for about three
          days; an endpoint that fails 20 times in a row is paused. Manage
          them from the API at{" "}
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded">/api/v1/webhooks</code>{" "}
          or with <code className="text-sm bg-muted px-1.5 py-0.5 rounded">ugig webhooks</code>.
        </p>
        <WebhookManager initialWebhooks={webhooks} />
      </main>
    </div>
  );
}
