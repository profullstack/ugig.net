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

  updateStatus: (
    id: string,
    status: "draft" | "active" | "paused" | "closed" | "filled"
  ) =>
    request(`/api/gigs/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  delete: (id: string) =>
    request(`/api/gigs/${id}`, {
      method: "DELETE",
    }),

  getMy: () => request("/api/gigs/my"),
};

// Saved Gigs API
export const savedGigs = {
  list: () => request("/api/saved-gigs"),

  save: (gigId: string) =>
    request("/api/saved-gigs", {
      method: "POST",
      body: JSON.stringify({ gig_id: gigId }),
    }),

  unsave: (gigId: string) =>
    request("/api/saved-gigs", {
      method: "DELETE",
      body: JSON.stringify({ gig_id: gigId }),
    }),
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

  bulkUpdateStatus: (
    applicationIds: string[],
    status: "pending" | "reviewing" | "shortlisted" | "rejected" | "accepted"
  ) =>
    request("/api/applications/bulk-status", {
      method: "PUT",
      body: JSON.stringify({ application_ids: applicationIds, status }),
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

// Subscriptions API
export const subscriptions = {
  get: () => request("/api/subscriptions"),

  createCheckout: () =>
    request("/api/subscriptions/checkout", {
      method: "POST",
    }),

  createPortalSession: () =>
    request("/api/subscriptions/portal", {
      method: "POST",
    }),

  cancel: () =>
    request("/api/subscriptions", {
      method: "DELETE",
    }),

  reactivate: () =>
    request("/api/subscriptions", {
      method: "PUT",
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

  sendTyping: (conversationId: string) =>
    request(`/api/conversations/${conversationId}/typing`, {
      method: "POST",
    }),

  getTyping: (conversationId: string) =>
    request<{ typing: string[] }>(`/api/conversations/${conversationId}/typing`),
};

// Video Calls API
export const videoCalls = {
  list: (params?: { upcoming?: boolean; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.upcoming) searchParams.set("upcoming", "true");
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    const query = searchParams.toString();
    return request(`/api/video-calls${query ? `?${query}` : ""}`);
  },

  get: (id: string) => request(`/api/video-calls/${id}`),

  create: (data: {
    participant_id: string;
    gig_id?: string;
    application_id?: string;
    scheduled_at?: string;
  }) =>
    request("/api/video-calls", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  start: (id: string) =>
    request(`/api/video-calls/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "start" }),
    }),

  end: (id: string) =>
    request(`/api/video-calls/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "end" }),
    }),

  cancel: (id: string) =>
    request(`/api/video-calls/${id}`, {
      method: "DELETE",
    }),
};

// Reviews API
export const reviews = {
  list: (params?: { gig_id?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.gig_id) searchParams.set("gig_id", params.gig_id);
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    const query = searchParams.toString();
    return request(`/api/reviews${query ? `?${query}` : ""}`);
  },

  get: (id: string) => request(`/api/reviews/${id}`),

  getForUser: (username: string, params?: { limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    const query = searchParams.toString();
    return request(`/api/users/${username}/reviews${query ? `?${query}` : ""}`);
  },

  create: (data: {
    gig_id: string;
    reviewee_id: string;
    rating: number;
    comment?: string;
  }) =>
    request("/api/reviews", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { rating?: number; comment?: string }) =>
    request(`/api/reviews/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request(`/api/reviews/${id}`, {
      method: "DELETE",
    }),
};

// Activity API
export const activity = {
  getForUser: (username: string, params?: { limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    const query = searchParams.toString();
    return request(`/api/users/${username}/activity${query ? `?${query}` : ""}`);
  },

  getMy: (params?: { limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    const query = searchParams.toString();
    return request(`/api/activity${query ? `?${query}` : ""}`);
  },
};

// Notifications API
export const notifications = {
  list: (params?: { unread?: boolean; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.unread) searchParams.set("unread", "true");
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    const query = searchParams.toString();
    return request(`/api/notifications${query ? `?${query}` : ""}`);
  },

  get: (id: string) => request(`/api/notifications/${id}`),

  markRead: (id: string) =>
    request(`/api/notifications/${id}`, {
      method: "PUT",
    }),

  markAllRead: () =>
    request("/api/notifications/read-all", {
      method: "PUT",
    }),

  delete: (id: string) =>
    request(`/api/notifications/${id}`, {
      method: "DELETE",
    }),
};

// Portfolio API
export const portfolio = {
  list: (userId: string) =>
    request(`/api/portfolio?user_id=${userId}`),

  create: (data: {
    title: string;
    description?: string | null;
    url?: string | null;
    image_url?: string | null;
    tags?: string[];
    gig_id?: string | null;
  }) =>
    request("/api/portfolio", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (
    id: string,
    data: {
      title?: string;
      description?: string | null;
      url?: string | null;
      image_url?: string | null;
      tags?: string[];
      gig_id?: string | null;
    }
  ) =>
    request(`/api/portfolio/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request(`/api/portfolio/${id}`, {
      method: "DELETE",
    }),
};
