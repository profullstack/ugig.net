import { NextRequest } from "next/server";
import { POST as applyToGig } from "../applications/route";

// POST /api/gigs/[id]/apply - Alias for POST /api/gigs/[id]/applications
// Fixes #12: POST /api/gigs/{id}/apply returns 404
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return applyToGig(request, context);
}
