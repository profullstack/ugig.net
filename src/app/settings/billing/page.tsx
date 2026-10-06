import { redirect } from "next/navigation";

export default async function SettingsBillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // CoinPay returns buyers here with ?payment=success; keep the query.
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  const qs = params.toString();
  redirect(`/dashboard/subscription${qs ? `?${qs}` : ""}`);
}
