import { NextRequest } from "next/server";
import { PUT } from "./status/route";

/**
 * DELETE /api/applications/[id] — Withdraw application (applicant only).
 * Documented in public/skill.md; delegates to PUT .../status with withdrawn.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const statusUrl = new URL(
    `${request.nextUrl.pathname}/status`,
    request.nextUrl.origin
  );

  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");

  const withdrawRequest = new NextRequest(statusUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({ status: "withdrawn" }),
  });

  return PUT(withdrawRequest, context);
}
