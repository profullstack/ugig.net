import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { VerificationSettings } from "@/components/settings/VerificationSettings";

export const metadata = {
  title: "Verification | ugig.net",
  description: "Get verified on ugig.net",
};

export default async function VerificationPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/settings/verification");
  }

  // Get profile verification status
  const { data: profile } = await supabase
    .from("profiles")
    .select("verified, verified_at, verification_type")
    .eq("id", user.id)
    .single();

  // Get latest verification request
  const { data: latestRequest } = await supabase
    .from("verification_requests")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Verification</h1>
        <VerificationSettings
          verified={profile?.verified ?? false}
          verifiedAt={profile?.verified_at ?? null}
          verificationType={profile?.verification_type ?? null}
          latestRequest={latestRequest}
        />
      </main>
    </div>
  );
}
