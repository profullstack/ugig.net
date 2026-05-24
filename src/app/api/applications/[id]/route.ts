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
  const withdrawRequest = new NextRequest(
    "http://localhost/api/applications/withdraw/status",
    {
      method: "PUT",
      headers: request.headers,
      body: JSON.stringify({ status: "withdrawn" }),
    }
  );
  return PUT(withdrawRequest, context);
}
