import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Header } from "@/components/layout/Header";
import { CliAuthApprove } from "@/components/cli-auth/CliAuthApprove";

export const metadata = {
  title: "Authorize CLI | ugig.net",
  description: "Approve a command-line login request",
};

async function getCliAuthRequest(
  code: string,
): Promise<{ status: string; scope: string; client_name: string | null } | null> {
  // device_codes isn't in the generated types yet.
   
  const db = createServiceClient() as any;
  const { data: row } = await db
    .from("device_codes")
    .select("status, scope, client_name, expires_at")
    .eq("user_code", code)
    .maybeSingle();
  if (!row) {
    return null;
  }
  const expired = new Date(row.expires_at).getTime() < Date.now();
  return {
    status: expired ? "expired" : row.status,
    scope: row.scope,
    client_name: row.client_name,
  };
}

export default async function CliAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const rawCode = typeof params.code === "string" ? params.code : "";
  const code = rawCode.trim().toUpperCase();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const target = code ? `/cli-auth?code=${encodeURIComponent(code)}` : "/cli-auth";
    redirect(`/login?redirect=${encodeURIComponent(target)}`);
  }

  const request = code ? await getCliAuthRequest(code) : null;

  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-md flex-col px-4 py-12">
        <CliAuthApprove code={code} request={request} />
      </main>
    </>
  );
}
