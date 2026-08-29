/** Thin wrapper over the /api/teams endpoints: one shape for data and errors. */
export async function teamRequest<T>(
  url: string,
  init?: RequestInit
): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: init?.body
        ? { "Content-Type": "application/json", ...init?.headers }
        : init?.headers,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { data: null, error: payload.error || "Something went wrong" };
    }
    return { data: (payload.data ?? payload) as T, error: null };
  } catch {
    return { data: null, error: "Network error" };
  }
}
