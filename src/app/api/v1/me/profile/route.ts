import type { NextRequest } from "next/server";
import { createProfileHandlers } from "@profullstack/profile";
import { getAuthContext, requireFullAccess } from "@/lib/auth/get-user";
import { profileStore, fillEmptyFullName } from "@/lib/profile";

export const dynamic = "force-dynamic";

// GET / PUT / PATCH /api/v1/me/profile: the caller's @profullstack/profile
// fields (session, Bearer JWT, AgentPass or a full-access API key).
const handlers = () =>
  createProfileHandlers({
    store: profileStore(),
    getUser: async (req: Request) => {
      const auth = await getAuthContext(req as NextRequest);
      if (!auth) return null;
      // A public (listing) API key never reads or writes contact details.
      if (requireFullAccess(auth)) return null;
      return { id: auth.user.id, email: auth.user.email ?? null };
    },
    onSaved: async (profile, user) => {
      try {
        await fillEmptyFullName(String(user.id), profile.first_name, profile.last_name);
      } catch (err) {
        console.error("[me/profile] full_name sync failed:", err);
      }
    },
  });

export const GET = (req: NextRequest) => handlers().GET(req);
export const PUT = (req: NextRequest) => handlers().PUT(req);
export const PATCH = (req: NextRequest) => handlers().PATCH(req);
