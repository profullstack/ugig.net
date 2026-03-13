import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authenticateApiKey } from "./api-key";
import { authenticateAgentPass } from "./agentpass";
import {
  createServiceClient as createServiceRoleClient,
  authenticateWithToken,
} from "@/lib/supabase/service";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthenticatedUser = {
  id: string;
  email?: string;
  authMethod: "session" | "api_key" | "agentpass";
  passportId?: string;
};

export type AuthContext = {
  user: AuthenticatedUser;
  supabase: SupabaseClient<Database>;
};

/**
 * Get the auth context (user + supabase client) from session cookies or API key.
 * For session auth, returns the session-scoped client (with RLS).
 * For API key auth, returns the service role client (bypasses RLS).
 * Routes already filter by user.id so data access is correctly scoped.
 */
export async function getAuthContext(
  request: NextRequest
): Promise<AuthContext | null> {
  // Try session-based auth first
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return {
      user: {
        id: user.id,
        email: user.email,
        authMethod: "session",
      },
      supabase,
    };
  }

  // Try Bearer token auth (Supabase JWT via Authorization header)
  const authHeader = request.headers.get("authorization");
  const tokenAuth = await authenticateWithToken(authHeader);
  if (tokenAuth) {
    return {
      user: {
        id: tokenAuth.user.id,
        email: tokenAuth.user.email,
        authMethod: "session",
      },
      supabase: tokenAuth.supabase,
    };
  }

  // Try AgentPass auth (Authorization: AgentPass <passport_id>:<sig>:<ts>)
  if (authHeader && /^AgentPass\s/i.test(authHeader)) {
    const agentPassResult = await authenticateAgentPass(authHeader);
    if (agentPassResult) {
      const serviceClient = createServiceRoleClient();
      return {
        user: {
          id: agentPassResult.userId,
          email: agentPassResult.email,
          authMethod: "agentpass",
          passportId: agentPassResult.passportId,
        },
        supabase: serviceClient,
      };
    }
    // If AgentPass header was provided but invalid, don't fall through
    return null;
  }

  // Fall back to API key auth
  const apiKeyHeader = request.headers.get("x-api-key");
  const apiKeyResult = await authenticateApiKey(authHeader, apiKeyHeader);

  if (apiKeyResult) {
    const serviceClient = createServiceRoleClient();
    return {
      user: {
        id: apiKeyResult.userId,
        authMethod: "api_key",
      },
      supabase: serviceClient,
    };
  }

  return null;
}

/**
 * Backward-compatible export used by several routes.
 */
export function createServiceClient() {
  return createServiceRoleClient();
}

