import { NextResponse, type NextRequest } from "next/server";
import { updateSession as updateSupabaseSession } from "@profullstack/stack/supabase";

export async function updateSession(request: NextRequest) {
  // Refresh session if expired - required for Server Components.
  // `disconnectRealtime`: middleware runs on every request and only needs
  // Auth/REST; skipping this leaks WebSocket state proportional to traffic.
  const { response, user } = await updateSupabaseSession(request, {
    disconnectRealtime: true,
  });

  // Protected routes - redirect to login if not authenticated
  const protectedPaths = ["/dashboard", "/profile", "/settings", "/messages"];
  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isProtectedPath && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Sanitize the redirect path to prevent XSS via URL parameter
    const safePath = request.nextUrl.pathname.replace(/[<>"']/g, "");
    url.searchParams.set("redirect", safePath);
    return NextResponse.redirect(url);
  }

  // Redirect logged-in users away from auth pages
  const authPaths = ["/login", "/signup"];
  const isAuthPath = authPaths.some(
    (path) => request.nextUrl.pathname === path
  );

  if (isAuthPath && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response as NextResponse;
}
