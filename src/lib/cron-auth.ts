import type { NextRequest } from "next/server";

/**
 * Cron auth shared by /api/cron/* routes: CRON_SECRET via x-cron-secret or
 * Authorization: Bearer. Fails closed when CRON_SECRET is unset.
 */
export function isAuthorizedCron(request: NextRequest): boolean {
  const provided =
    request.headers.get("x-cron-secret") ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  return Boolean(process.env.CRON_SECRET && provided && provided === process.env.CRON_SECRET);
}
