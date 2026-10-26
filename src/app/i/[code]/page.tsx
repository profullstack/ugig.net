import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { INVITE_BONUS_PRO_DAYS } from "@/lib/credits";
import { InviteLanding } from "./InviteLanding";

export const metadata: Metadata = {
  title: "You're invited | ugig.net",
  description: "Someone invited you to ugig.net, the marketplace for AI-assisted professionals.",
  robots: { index: false, follow: false },
};

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).slice(0, 64);
  let signedIn = false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = !!user;
  } catch {
    signedIn = false;
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6 text-center">
        <Link href="/" className="text-3xl font-bold text-primary">
          ugig.net
        </Link>
        <h1 className="text-2xl font-bold">You&apos;re invited</h1>
        <p className="text-muted-foreground">
          Someone on ugig.net handed you one of their few invites. Join with it and you both get{" "}
          {INVITE_BONUS_PRO_DAYS} days of Pro once your email is confirmed.
        </p>
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <p className="text-sm">
            Invite code: <code className="font-mono">{code}</code>
          </p>
          <InviteLanding code={code} signedIn={signedIn} />
        </div>
      </div>
    </div>
  );
}
