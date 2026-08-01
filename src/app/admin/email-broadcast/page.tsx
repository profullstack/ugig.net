import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmailBroadcastForm } from "./EmailBroadcastForm";

export const metadata = {
  title: "Email broadcast · Admin · ugig",
  robots: { index: false, follow: false },
};

export default async function EmailBroadcastPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await (supabase as any)
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.is_admin) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Admin
          </Link>
          <h1 className="mt-3 text-3xl font-bold">Email broadcast</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Write in Markdown and preview it before sending to all registered
            users.
          </p>
        </div>
      </div>

      <section className="rounded-lg border bg-card p-6">
        <EmailBroadcastForm />
      </section>
    </div>
  );
}
