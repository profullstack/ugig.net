/**
 * Client-side API wrapper for making requests to the server
 */

type ApiResponse<T> = {
  data: T | null;
  error: string | null;
};

async function request<T>(
  url: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        data: null,
        error: data.error || "An error occurred",
      };
    }

    return {
      data,
      error: null,
    };
  } catch {
    return {
      data: null,
      error: "Network error. Please try again.",
    };
  }
}

// Auth API
export const auth = {
  signup: (data: { email: string; password: string; username: string }) =>
    request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  logout: () =>
    request("/api/auth/logout", {
      method: "POST",
    }),

  forgotPassword: (data: { email: string }) =>
    request("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  resetPassword: (data: { password: string }) =>
    request("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getSession: () => request("/api/auth/session"),
};

// Profile API
export const profile = {
  get: () => request("/api/profile"),

  update: (data: Record<string, unknown>) =>
    request("/api/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  uploadAvatar: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    return fetch("/api/profile/avatar", {
      method: "POST",
      body: formData,
    }).then((res) => res.json());
  },

  getPublic: (username: string) => request(`/api/users/${username}`),
};

// Gigs API
export const gigs = {
  list: (params?: URLSearchParams) =>
    request(`/api/gigs${params ? `?${params}` : ""}`),

  get: (id: string) => request(`/api/gigs/${id}`),

  create: (data: Record<string, unknown>) =>
    request("/api/gigs", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Record<string, unknown>) =>
    request(`/api/gigs/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request(`/api/gigs/${id}`, {
      method: "DELETE",
    }),

  getMy: () => request("/api/gigs/my"),
};

// Applications API
export const applications = {
  create: (data: Record<string, unknown>) =>
    request("/api/applications", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getMy: () => request("/api/applications/my"),

  getForGig: (gigId: string) => request(`/api/gigs/${gigId}/applications`),

  updateStatus: (id: string, status: string) =>
    request(`/api/applications/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),
};

// Payments API
export const payments = {
  create: (data: {
    type: "subscription" | "gig_payment" | "tip";
    currency: string;
    amount_usd?: number;
    gig_id?: string;
  }) =>
    request("/api/payments/coinpayportal/create", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// Conversations API
export const conversations = {
  list: () => request("/api/conversations"),

  get: (id: string) => request(`/api/conversations/${id}`),

  create: (data: { gig_id: string; recipient_id: string }) =>
    request("/api/conversations", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// Messages API
export const messages = {
  list: (conversationId: string, cursor?: string) =>
    request(
      `/api/conversations/${conversationId}/messages${cursor ? `?cursor=${cursor}` : ""}`
    ),

  send: (conversationId: string, content: string) =>
    request(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  markRead: (messageId: string) =>
    request(`/api/messages/${messageId}/read`, {
      method: "PUT",
    }),
};
