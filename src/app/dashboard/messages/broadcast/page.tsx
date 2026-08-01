import { redirect } from "next/navigation";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BroadcastForm } from "./BroadcastForm";

export const metadata = {
  title: "Broadcast | ugig.net",
  description: "Message everyone who applied to your gigs and bounties",
};

export default async function BroadcastPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard/messages/broadcast");
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/dashboard/messages"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Messages
        </Link>

        <div className="flex items-center gap-3 mt-3 mb-8">
          <div className="p-3 bg-primary/10 rounded-xl">
            <Megaphone className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Broadcast</h1>
            <p className="text-muted-foreground text-sm">
              Send one message to everyone at once, in-app and by email
            </p>
          </div>
        </div>

        <section className="bg-card rounded-lg border border-border shadow-sm p-6">
          <BroadcastForm />
        </section>
      </div>
    </main>
  );
}
