import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authenticateApiKey } from "./api-key";
import { authenticateAgentPass } from "./agentpass";
import {
  createServiceClient as createServiceRoleClient,
  authenticateWithToken,
} from "@/lib/supabase/service";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiKeyScope } from "@/lib/api-keys";

export type AuthenticatedUser = {
  id: string;
  email?: string;
  authMethod: "session" | "api_key" | "agentpass";
  passportId?: string;
  scope?: ApiKeyScope;
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
    // Enforce public key scope restrictions
    if (apiKeyResult.scope === "public") {
      if (!isPublicScopeAllowed(request)) {
        return null; // Will result in 401 from the route handler
      }
    }

    const serviceClient = createServiceRoleClient();
    return {
      user: {
        id: apiKeyResult.userId,
        authMethod: "api_key",
        scope: apiKeyResult.scope,
      },
      supabase: serviceClient,
    };
  }

  return null;
}

/**
 * Routes allowed for public-scope API keys.
 * Public keys can only read listings and create content.
 */
const PUBLIC_SCOPE_ALLOWLIST: Array<{ method: string; pattern: RegExp }> = [
  // Create listings
  { method: "POST", pattern: /^\/api\/gigs\/?$/ },
  { method: "POST", pattern: /^\/api\/skills\/?$/ },
  { method: "POST", pattern: /^\/api\/mcp\/?$/ },
  { method: "POST", pattern: /^\/api\/applications\/?$/ },
  // Browse/read endpoints
  { method: "GET", pattern: /^\/api\/profile\/?$/ },
  { method: "GET", pattern: /^\/api\/gigs(\/.*)?$/ },
  { method: "GET", pattern: /^\/api\/mcp(\/.*)?$/ },
  { method: "GET", pattern: /^\/api\/skills(\/.*)?$/ },
  { method: "GET", pattern: /^\/api\/feed(\/.*)?$/ },
  { method: "GET", pattern: /^\/api\/candidates(\/.*)?$/ },
];

function isPublicScopeAllowed(request: NextRequest): boolean {
  const method = request.method.toUpperCase();
  const pathname = new URL(request.url).pathname;

  return PUBLIC_SCOPE_ALLOWLIST.some(
    (rule) => rule.method === method && rule.pattern.test(pathname)
  );
}

/**
 * Check if the current auth context has public (restricted) scope.
 * Returns a 403 NextResponse if restricted, or null if allowed.
 * Use this in route handlers that need to give a specific error message
 * instead of the generic 401 from getAuthContext.
 */
export function requireFullAccess(auth: AuthContext): NextResponse | null {
  if (auth.user.scope === "public") {
    return NextResponse.json(
      {
        error:
          "This API key only has public (listing) access. Use a full-access key for this endpoint.",
      },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Backward-compatible export used by several routes.
 */
export function createServiceClient() {
  return createServiceRoleClient();
}

