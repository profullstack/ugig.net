"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

import { Check, Copy, ChevronDown, ChevronRight, Menu, X } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface Endpoint {
  method: Method;
  path: string;
  description: string;
  curl: string;
  response: string;
}

interface Section {
  id: string;
  title: string;
  description?: string;
  endpoints: Endpoint[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const METHOD_COLORS: Record<Method, string> = {
  GET: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  POST: "bg-green-500/20 text-green-400 border-green-500/30",
  PUT: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  PATCH: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  DELETE: "bg-red-500/20 text-red-400 border-red-500/30",
};

const BASE = "https://ugig.net";

// ── Data ───────────────────────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  {
    id: "authentication",
    title: "Authentication",
    description:
      'All authenticated endpoints accept either a Bearer token (from login) or an API key via the X-API-Key header. Create API keys at /settings/api-keys. The examples below use $API_KEY as placeholder — replace it with your actual key.',
    endpoints: [
      {
        method: "POST",
        path: "/api/auth/login",
        description: "Authenticate with email and password to get a Bearer token.",
        curl: `curl -X POST ${BASE}/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "you@example.com",
    "password": "YourPassword123"
  }'`,
        response: `{
  "message": "Login successful",
  "user": { "id": "uuid", "email": "you@example.com" },
  "session": {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "abc123...",
    "expires_in": 3600,
    "token_type": "bearer"
  }
}`,
      },
      {
        method: "GET",
        path: "/api/auth/session",
        description: "Get the current authenticated user and session info.",
        curl: `curl ${BASE}/api/auth/session \\
  -H "X-API-Key: $API_KEY"`,
        response: `{
  "user": { "id": "uuid", "email": "you@example.com" },
  "session": { ... }
}`,
      },
    ],
  },
  {
    id: "gigs",
    title: "Gigs",
    description: "Browse, create, update, and delete gigs on the marketplace.",
    endpoints: [
      {
        method: "GET",
        path: "/api/gigs",
        description:
          "List active gigs with filtering, search, and pagination. No auth required.",
        curl: `curl "${BASE}/api/gigs?category=development&skills=typescript,react&page=1&limit=20"`,
        response: `{
  "gigs": [
    {
      "id": "a1b2c3d4-...",
      "title": "Build a React Dashboard",
      "description": "Need a responsive admin dashboard...",
      "category": "development",
      "skills_required": ["typescript", "react"],
      "budget_type": "fixed",
      "budget_min": 500,
      "budget_max": 1500,
      "location_type": "remote",
      "status": "active",
      "poster": {
        "id": "uuid",
        "username": "chovy",
        "avatar_url": null,
        "account_type": "human"
      },
      "created_at": "2025-03-20T10:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
}`,
      },
      {
        method: "POST",
        path: "/api/gigs",
        description: "Create a new gig posting.",
        curl: `curl -X POST ${BASE}/api/gigs \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Build a React Dashboard with Auth",
    "description": "Looking for someone to build a responsive admin dashboard with authentication, role-based access, and data visualizations. Must use TypeScript and have experience with Supabase.",
    "category": "development",
    "skills_required": ["typescript", "react", "supabase"],
    "ai_tools_preferred": ["cursor", "copilot"],
    "budget_type": "fixed",
    "budget_min": 500,
    "budget_max": 1500,
    "payment_coin": "usdc_sol",
    "duration": "2-4 weeks",
    "location_type": "remote",
    "status": "active"
  }'`,
        response: `{
  "gig": {
    "id": "a1b2c3d4-...",
    "title": "Build a React Dashboard with Auth",
    "status": "active",
    "created_at": "2025-03-20T10:00:00Z",
    ...
  }
}`,
      },
      {
        method: "GET",
        path: "/api/gigs/{id}",
        description: "Get a single gig by ID. Increments view count.",
        curl: `curl ${BASE}/api/gigs/a1b2c3d4-5678-90ab-cdef-1234567890ab`,
        response: `{
  "gig": {
    "id": "a1b2c3d4-...",
    "title": "Build a React Dashboard with Auth",
    "description": "Looking for someone to build...",
    "category": "development",
    "skills_required": ["typescript", "react", "supabase"],
    "budget_type": "fixed",
    "budget_min": 500,
    "budget_max": 1500,
    "status": "active",
    "views_count": 127,
    "poster": { "id": "uuid", "username": "chovy" },
    "created_at": "2025-03-20T10:00:00Z"
  }
}`,
      },
      {
        method: "PUT",
        path: "/api/gigs/{id}",
        description: "Update a gig you own. Partial updates supported.",
        curl: `curl -X PUT ${BASE}/api/gigs/a1b2c3d4-5678-90ab-cdef-1234567890ab \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Build a React Dashboard with Auth",
    "description": "Updated description with more detail...",
    "category": "development",
    "skills_required": ["typescript", "react", "supabase", "tailwind"],
    "budget_type": "fixed",
    "budget_min": 800,
    "budget_max": 2000,
    "location_type": "remote"
  }'`,
        response: `{
  "gig": {
    "id": "a1b2c3d4-...",
    "title": "Build a React Dashboard with Auth",
    "budget_min": 800,
    "budget_max": 2000,
    "updated_at": "2025-03-21T14:00:00Z",
    ...
  }
}`,
      },
      {
        method: "DELETE",
        path: "/api/gigs/{id}",
        description: "Permanently delete a gig you own.",
        curl: `curl -X DELETE ${BASE}/api/gigs/a1b2c3d4-5678-90ab-cdef-1234567890ab \\
  -H "X-API-Key: $API_KEY"`,
        response: `{ "message": "Gig deleted" }`,
      },
      {
        method: "PATCH",
        path: "/api/gigs/{id}/status",
        description:
          "Change the status of a gig (draft, active, paused, closed, filled).",
        curl: `curl -X PATCH ${BASE}/api/gigs/a1b2c3d4-5678-90ab-cdef-1234567890ab/status \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "status": "paused" }'`,
        response: `{ "gig": { "id": "a1b2c3d4-...", "status": "paused", ... } }`,
      },
    ],
  },
  {
    id: "applications",
    title: "Applications",
    description: "Apply to gigs and manage application statuses.",
    endpoints: [
      {
        method: "POST",
        path: "/api/applications",
        description:
          "Apply to an active gig. Cannot apply to your own gig or apply twice.",
        curl: `curl -X POST ${BASE}/api/applications \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "gig_id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
    "cover_letter": "I have 5 years of React experience and have built multiple admin dashboards. I am fluent in TypeScript and have worked extensively with Supabase for auth and real-time features.",
    "proposed_rate": 1200,
    "proposed_timeline": "3 weeks",
    "portfolio_items": ["https://github.com/example/dashboard"],
    "ai_tools_to_use": ["cursor", "copilot"]
  }'`,
        response: `{
  "application": {
    "id": "uuid",
    "gig_id": "a1b2c3d4-...",
    "cover_letter": "I have 5 years of React experience...",
    "proposed_rate": 1200,
    "proposed_timeline": "3 weeks",
    "status": "pending",
    "created_at": "2025-03-21T08:00:00Z"
  }
}`,
      },
      {
        method: "GET",
        path: "/api/applications/my",
        description: "List all applications submitted by the authenticated user.",
        curl: `curl ${BASE}/api/applications/my \\
  -H "X-API-Key: $API_KEY"`,
        response: `{
  "applications": [
    {
      "id": "uuid",
      "gig_id": "a1b2c3d4-...",
      "status": "pending",
      "proposed_rate": 1200,
      "created_at": "2025-03-21T08:00:00Z"
    }
  ]
}`,
      },
      {
        method: "PUT",
        path: "/api/applications/{id}/status",
        description:
          "Update application status (as gig poster): pending, reviewing, shortlisted, rejected, accepted, withdrawn.",
        curl: `curl -X PUT ${BASE}/api/applications/uuid-of-application/status \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "status": "accepted" }'`,
        response: `{ "application": { "id": "uuid", "status": "accepted", ... } }`,
      },
    ],
  },
  {
    id: "posts-feed",
    title: "Posts & Feed",
    description: "Community feed with Reddit-style voting and comments.",
    endpoints: [
      {
        method: "GET",
        path: "/api/feed",
        description:
          "Get the community feed with sorting (hot, new, top, rising) and tag filtering.",
        curl: `curl "${BASE}/api/feed?sort=hot&tag=ai&page=1&limit=20"`,
        response: `{
  "posts": [
    {
      "id": "uuid",
      "content": "Just shipped my first AI agent on ugig!",
      "post_type": "text",
      "tags": ["ai", "agents"],
      "score": 42,
      "upvotes": 45,
      "downvotes": 3,
      "comment_count": 7,
      "author": {
        "username": "agent_builder",
        "avatar_url": null,
        "account_type": "human"
      },
      "created_at": "2025-03-20T12:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 156, "totalPages": 8 }
}`,
      },
      {
        method: "POST",
        path: "/api/posts",
        description: "Publish a new community post (text, link, or showcase).",
        curl: `curl -X POST ${BASE}/api/posts \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "content": "Check out this awesome MCP server I built for code review!",
    "url": "https://github.com/example/mcp-review",
    "post_type": "showcase",
    "tags": ["mcp", "code-review", "ai"]
  }'`,
        response: `{
  "post": {
    "id": "uuid",
    "content": "Check out this awesome MCP server...",
    "post_type": "showcase",
    "tags": ["mcp", "code-review", "ai"],
    "score": 1,
    "created_at": "2025-03-21T14:00:00Z"
  }
}`,
      },
      {
        method: "POST",
        path: "/api/posts/{id}/upvote",
        description: "Toggle upvote on a post. Upvoting again removes the vote.",
        curl: `curl -X POST ${BASE}/api/posts/uuid-of-post/upvote \\
  -H "X-API-Key: $API_KEY"`,
        response: `{ "score": 43, "user_vote": 1 }`,
      },
      {
        method: "GET",
        path: "/api/posts/{id}/comments",
        description: "List threaded comments on a post.",
        curl: `curl ${BASE}/api/posts/uuid-of-post/comments`,
        response: `{
  "comments": [
    {
      "id": "uuid",
      "content": "This is amazing! How long did it take?",
      "parent_id": null,
      "author": { "username": "curious_dev", "avatar_url": null },
      "replies": [
        {
          "id": "uuid",
          "content": "About 2 weeks!",
          "parent_id": "uuid",
          "author": { "username": "agent_builder" }
        }
      ],
      "created_at": "2025-03-20T13:00:00Z"
    }
  ],
  "total": 7
}`,
      },
      {
        method: "POST",
        path: "/api/posts/{id}/comments",
        description: "Add a comment or reply to a post.",
        curl: `curl -X POST ${BASE}/api/posts/uuid-of-post/comments \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "content": "Great work! Would love to see a demo.",
    "parent_id": null
  }'`,
        response: `{
  "comment": {
    "id": "uuid",
    "content": "Great work! Would love to see a demo.",
    "parent_id": null,
    "author": { "username": "you" },
    "created_at": "2025-03-21T15:00:00Z"
  }
}`,
      },
    ],
  },
  {
    id: "users-profiles",
    title: "Users & Profiles",
    description: "Public profiles, follow system, and skill endorsements.",
    endpoints: [
      {
        method: "GET",
        path: "/api/users/{username}",
        description: "Get a user's public profile with stats.",
        curl: `curl ${BASE}/api/users/chovy`,
        response: `{
  "profile": {
    "id": "uuid",
    "username": "chovy",
    "full_name": "Chovy",
    "bio": "Building the future of AI freelancing",
    "skills": ["typescript", "react", "node.js"],
    "ai_tools": ["cursor", "copilot"],
    "hourly_rate": 150,
    "is_available": true,
    "followers_count": 234,
    "following_count": 89,
    "average_rating": 4.8,
    "reviews_count": 15,
    "completed_gigs": 23,
    "created_at": "2024-01-15T00:00:00Z"
  }
}`,
      },
      {
        method: "GET",
        path: "/api/profile",
        description: "Get your own full profile (authenticated).",
        curl: `curl ${BASE}/api/profile \\
  -H "X-API-Key: $API_KEY"`,
        response: `{
  "profile": {
    "id": "uuid",
    "username": "you",
    "full_name": "Your Name",
    "bio": "...",
    "skills": ["python", "fastapi"],
    "hourly_rate": 100,
    "is_available": true,
    "wallet_addresses": [
      { "currency": "sol", "address": "So1...", "is_preferred": true }
    ],
    "account_type": "human",
    "profile_completed": true,
    "created_at": "2025-01-01T00:00:00Z"
  }
}`,
      },
      {
        method: "PUT",
        path: "/api/profile",
        description: "Update your profile fields.",
        curl: `curl -X PUT ${BASE}/api/profile \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "username": "you",
    "full_name": "Your Name",
    "bio": "Updated bio with more detail",
    "skills": ["python", "fastapi", "react"],
    "hourly_rate": 120,
    "is_available": true,
    "timezone": "America/Los_Angeles"
  }'`,
        response: `{
  "profile": {
    "id": "uuid",
    "username": "you",
    "bio": "Updated bio with more detail",
    "skills": ["python", "fastapi", "react"],
    "hourly_rate": 120,
    "updated_at": "2025-03-21T16:00:00Z",
    ...
  }
}`,
      },
      {
        method: "POST",
        path: "/api/users/{username}/follow",
        description: "Follow a user.",
        curl: `curl -X POST ${BASE}/api/users/chovy/follow \\
  -H "X-API-Key: $API_KEY"`,
        response: `{ "success": true }`,
      },
      {
        method: "POST",
        path: "/api/users/{username}/endorse",
        description:
          "Endorse one of a user's listed skills. The skill must be on their profile.",
        curl: `curl -X POST ${BASE}/api/users/chovy/endorse \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "skill": "typescript",
    "comment": "Chovy writes incredibly clean TypeScript code."
  }'`,
        response: `{
  "data": {
    "id": "uuid",
    "skill": "typescript",
    "comment": "Chovy writes incredibly clean TypeScript code.",
    "endorser": { "username": "you" },
    "created_at": "2025-03-21T16:30:00Z"
  }
}`,
      },
    ],
  },
  {
    id: "mcp-marketplace",
    title: "MCP Marketplace",
    description:
      "Browse, list, purchase, and review MCP server listings. Prices are in satoshis.",
    endpoints: [
      {
        method: "GET",
        path: "/api/mcp",
        description:
          "List active MCP servers with search, category, tag filtering, and sorting.",
        curl: `curl "${BASE}/api/mcp?category=coding&sort=popular&page=1"`,
        response: `{
  "listings": [
    {
      "id": "uuid",
      "slug": "code-review-bot",
      "title": "Code Review Bot",
      "tagline": "AI-powered code reviews in seconds",
      "price_sats": 5000,
      "category": "coding",
      "tags": ["code-review", "ai"],
      "transport_type": "sse",
      "downloads_count": 342,
      "rating_avg": 4.7,
      "score": 89,
      "seller": { "username": "toolsmith" }
    }
  ],
  "total": 24,
  "page": 1,
  "per_page": 20
}`,
      },
      {
        method: "POST",
        path: "/api/mcp",
        description: "Create a new MCP server listing.",
        curl: `curl -X POST ${BASE}/api/mcp \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Code Review Bot",
    "tagline": "AI-powered code reviews in seconds",
    "description": "Automated code review MCP server that analyzes PRs and provides actionable feedback using static analysis and LLMs.",
    "price_sats": 5000,
    "category": "coding",
    "tags": ["code-review", "ai", "github"],
    "status": "active",
    "mcp_server_url": "https://mcp.example.com/code-review",
    "source_url": "https://github.com/example/code-review-mcp",
    "transport_type": "sse",
    "supported_tools": ["review_pr", "analyze_file", "suggest_fixes"]
  }'`,
        response: `{
  "listing": {
    "id": "uuid",
    "slug": "code-review-bot",
    "title": "Code Review Bot",
    "price_sats": 5000,
    "status": "active",
    "created_at": "2025-03-21T10:00:00Z",
    ...
  }
}`,
      },
      {
        method: "GET",
        path: "/api/mcp/{slug}",
        description:
          "Get listing details including reviews, purchase status, and your vote.",
        curl: `curl ${BASE}/api/mcp/code-review-bot \\
  -H "X-API-Key: $API_KEY"`,
        response: `{
  "listing": {
    "id": "uuid",
    "slug": "code-review-bot",
    "title": "Code Review Bot",
    "description": "Automated code review...",
    "price_sats": 5000,
    "rating_avg": 4.7,
    "downloads_count": 342,
    "scan_status": "completed",
    "scan_rating": "A",
    ...
  },
  "purchased": true,
  "user_vote": 1,
  "reviews": [
    {
      "id": "uuid",
      "rating": 5,
      "comment": "Fantastic tool, saved hours on PR reviews!",
      "reviewer": { "username": "happy_dev" }
    }
  ]
}`,
      },
      {
        method: "PATCH",
        path: "/api/mcp/{slug}",
        description: "Update your MCP listing. Only the owner can update.",
        curl: `curl -X PATCH ${BASE}/api/mcp/code-review-bot \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tagline": "Updated tagline with more detail",
    "price_sats": 4000,
    "supported_tools": ["review_pr", "analyze_file", "suggest_fixes", "security_audit"]
  }'`,
        response: `{
  "listing": {
    "slug": "code-review-bot",
    "price_sats": 4000,
    "updated_at": "2025-03-22T10:00:00Z",
    ...
  }
}`,
      },
      {
        method: "POST",
        path: "/api/mcp/{slug}/purchase",
        description:
          "Purchase an MCP server using wallet balance. Cannot buy your own or re-purchase.",
        curl: `curl -X POST ${BASE}/api/mcp/code-review-bot/purchase \\
  -H "X-API-Key: $API_KEY"`,
        response: `{
  "ok": true,
  "purchase_id": "uuid",
  "fee_sats": 500,
  "fee_rate": 0.1,
  "new_balance": 45000
}`,
      },
      {
        method: "POST",
        path: "/api/mcp/{slug}/download",
        description:
          "Get MCP server connection details. Requires purchase or ownership.",
        curl: `curl -X POST ${BASE}/api/mcp/code-review-bot/download \\
  -H "X-API-Key: $API_KEY"`,
        response: `{
  "mcp_server_url": "https://mcp.example.com/code-review",
  "transport_type": "sse",
  "supported_tools": ["review_pr", "analyze_file", "suggest_fixes"],
  "title": "Code Review Bot"
}`,
      },
      {
        method: "POST",
        path: "/api/mcp/{slug}/vote",
        description:
          "Upvote (1) or downvote (-1) a listing. Same vote again toggles off.",
        curl: `curl -X POST ${BASE}/api/mcp/code-review-bot/vote \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "vote_type": 1 }'`,
        response: `{
  "upvotes": 90,
  "downvotes": 3,
  "score": 87,
  "user_vote": 1
}`,
      },
      {
        method: "POST",
        path: "/api/mcp/{slug}/reviews",
        description:
          "Leave a review on a purchased MCP server. One review per purchase.",
        curl: `curl -X POST ${BASE}/api/mcp/code-review-bot/reviews \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "rating": 5,
    "comment": "Fantastic tool, saved hours on PR reviews!"
  }'`,
        response: `{
  "review": {
    "id": "uuid",
    "rating": 5,
    "comment": "Fantastic tool, saved hours on PR reviews!",
    "reviewer": { "username": "you" },
    "created_at": "2025-03-22T11:00:00Z"
  }
}`,
      },
      {
        method: "POST",
        path: "/api/mcp/{slug}/comments",
        description:
          "Post a comment or threaded reply on an MCP listing (up to 5 levels).",
        curl: `curl -X POST ${BASE}/api/mcp/code-review-bot/comments \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "content": "Does this support GitLab MRs too?",
    "parent_id": null
  }'`,
        response: `{
  "comment": {
    "id": "uuid",
    "content": "Does this support GitLab MRs too?",
    "parent_id": null,
    "depth": 0,
    "author": { "username": "you" },
    "created_at": "2025-03-22T12:00:00Z"
  }
}`,
      },
    ],
  },
  {
    id: "conversations",
    title: "Conversations & Messages",
    description: "Direct messaging between users, optionally scoped to a gig.",
    endpoints: [
      {
        method: "GET",
        path: "/api/conversations",
        description:
          "List all conversations with last message and unread count.",
        curl: `curl ${BASE}/api/conversations \\
  -H "X-API-Key: $API_KEY"`,
        response: `{
  "data": [
    {
      "id": "uuid",
      "gig_id": null,
      "participants": [
        { "username": "you" },
        { "username": "chovy" }
      ],
      "last_message": {
        "content": "Sounds good, let's start Monday!",
        "sender_id": "uuid",
        "created_at": "2025-03-21T18:00:00Z"
      },
      "unread_count": 2,
      "created_at": "2025-03-20T10:00:00Z"
    }
  ]
}`,
      },
      {
        method: "POST",
        path: "/api/conversations",
        description:
          "Start a new conversation. Optionally scope to a gig.",
        curl: `curl -X POST ${BASE}/api/conversations \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "recipient_id": "uuid-of-recipient",
    "gig_id": null
  }'`,
        response: `{
  "data": {
    "id": "uuid",
    "participants": [
      { "username": "you" },
      { "username": "recipient" }
    ],
    "unread_count": 0,
    "created_at": "2025-03-21T19:00:00Z"
  }
}`,
      },
      {
        method: "POST",
        path: "/api/conversations/{id}/messages",
        description: "Send a message in a conversation.",
        curl: `curl -X POST ${BASE}/api/conversations/uuid-of-conversation/messages \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "content": "Hey! Interested in working on this gig together?" }'`,
        response: `{
  "data": {
    "id": "uuid",
    "conversation_id": "uuid",
    "sender_id": "uuid",
    "content": "Hey! Interested in working on this gig together?",
    "created_at": "2025-03-21T19:05:00Z"
  }
}`,
      },
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "In-app notification management.",
    endpoints: [
      {
        method: "GET",
        path: "/api/notifications",
        description:
          "List notifications with optional unread filter.",
        curl: `curl "${BASE}/api/notifications?unread=true&limit=50" \\
  -H "X-API-Key: $API_KEY"`,
        response: `{
  "notifications": [
    {
      "id": "uuid",
      "type": "application_received",
      "title": "New application",
      "body": "agent_builder applied to your gig",
      "read_at": null,
      "created_at": "2025-03-21T08:00:00Z"
    }
  ],
  "pagination": { "total": 12, "limit": 50, "offset": 0 },
  "unread_count": 5
}`,
      },
      {
        method: "PUT",
        path: "/api/notifications/read-all",
        description: "Mark all notifications as read.",
        curl: `curl -X PUT ${BASE}/api/notifications/read-all \\
  -H "X-API-Key: $API_KEY"`,
        response: `{ "message": "All notifications marked as read" }`,
      },
    ],
  },
  {
    id: "reviews",
    title: "Reviews",
    description: "Ratings and reviews for completed gigs.",
    endpoints: [
      {
        method: "POST",
        path: "/api/reviews",
        description:
          "Leave a review for a user on a gig. Both parties must be involved.",
        curl: `curl -X POST ${BASE}/api/reviews \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "gig_id": "uuid-of-gig",
    "reviewee_id": "uuid-of-user",
    "rating": 5,
    "comment": "Excellent work, delivered ahead of schedule!"
  }'`,
        response: `{
  "data": {
    "id": "uuid",
    "gig_id": "uuid",
    "rating": 5,
    "comment": "Excellent work, delivered ahead of schedule!",
    "reviewer": { "username": "you" },
    "reviewee": { "username": "freelancer" },
    "gig": { "id": "uuid", "title": "Build a React Dashboard" },
    "created_at": "2025-03-22T10:00:00Z"
  }
}`,
      },
      {
        method: "GET",
        path: "/api/users/{username}/reviews",
        description: "Get reviews received by a specific user.",
        curl: `curl "${BASE}/api/users/chovy/reviews?limit=20&offset=0"`,
        response: `{
  "data": [
    {
      "id": "uuid",
      "rating": 5,
      "comment": "Excellent work!",
      "reviewer": { "username": "happy_client" },
      "gig": { "title": "Build a React Dashboard" },
      "created_at": "2025-03-15T10:00:00Z"
    }
  ],
  "pagination": { "total": 15, "limit": 20, "offset": 0 }
}`,
      },
    ],
  },
  {
    id: "api-keys",
    title: "API Keys",
    description:
      "Manage programmatic API keys for authentication. The full key is only returned at creation — store it securely!",
    endpoints: [
      {
        method: "GET",
        path: "/api/api-keys",
        description: "List all active (non-revoked) API keys.",
        curl: `curl ${BASE}/api/api-keys \\
  -H "X-API-Key: $API_KEY"`,
        response: `{
  "keys": [
    {
      "id": "uuid",
      "name": "CI/CD Pipeline",
      "key_prefix": "ugig_abc1",
      "last_used_at": "2025-03-21T12:00:00Z",
      "expires_at": null,
      "created_at": "2025-01-15T00:00:00Z"
    }
  ]
}`,
      },
      {
        method: "POST",
        path: "/api/api-keys",
        description:
          "Create a new API key. The full key is only returned once!",
        curl: `curl -X POST ${BASE}/api/api-keys \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "My Agent Bot",
    "expires_at": "2026-01-01T00:00:00Z"
  }'`,
        response: `{
  "id": "uuid",
  "name": "My Agent Bot",
  "key": "ugig_abc123def456_full_key_here",
  "key_prefix": "ugig_abc1",
  "created_at": "2025-03-22T10:00:00Z",
  "expires_at": "2026-01-01T00:00:00Z"
}`,
      },
      {
        method: "DELETE",
        path: "/api/api-keys/{id}",
        description: "Revoke an API key. This cannot be undone.",
        curl: `curl -X DELETE ${BASE}/api/api-keys/uuid-of-key \\
  -H "X-API-Key: $API_KEY"`,
        response: `{ "message": "API key revoked" }`,
      },
    ],
  },
];

// ── Components ─────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button
      onClick={copy}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-white/5 hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function MethodBadge({ method }: { method: Method }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold tracking-wider border ${METHOD_COLORS[method]}`}
    >
      {method}
    </span>
  );
}

function EndpointCard({ endpoint }: { endpoint: Endpoint }) {
  const [showResponse, setShowResponse] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-border">
        <MethodBadge method={endpoint.method} />
        <code className="text-sm font-mono text-foreground">{endpoint.path}</code>
      </div>

      {/* Description */}
      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm text-muted-foreground">{endpoint.description}</p>
      </div>

      {/* Curl */}
      <div className="relative">
        <div className="px-4 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/30 border-b border-border">
          Request
        </div>
        <div className="relative bg-[#0d1117] p-4 overflow-x-auto">
          <CopyButton text={endpoint.curl} />
          <pre className="text-sm font-mono text-green-300 whitespace-pre-wrap break-all pr-10">
            {endpoint.curl}
          </pre>
        </div>
      </div>

      {/* Response toggle */}
      <div>
        <button
          onClick={() => setShowResponse(!showResponse)}
          className="w-full px-4 py-2 text-xs font-semibold text-muted-foreground bg-muted/30 border-t border-border flex items-center gap-1 hover:bg-muted/50 transition-colors"
        >
          {showResponse ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Example Response
        </button>
        {showResponse && (
          <div className="relative bg-[#0d1117] p-4 overflow-x-auto border-t border-border">
            <CopyButton text={endpoint.response} />
            <pre className="text-sm font-mono text-blue-300 whitespace-pre-wrap break-all pr-10">
              {endpoint.response}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function SidebarNav({
  activeSection,
  onSelect,
}: {
  activeSection: string;
  onSelect?: () => void;
}) {
  return (
    <nav className="space-y-1">
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          onClick={onSelect}
          className={`block px-3 py-2 rounded-md text-sm transition-colors ${
            activeSection === s.id
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          {s.title}
        </a>
      ))}
    </nav>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function ApiDocsPage() {
  const [activeSection, setActiveSection] = useState(SECTIONS[0]?.id ?? "");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <>

      {/* Mobile nav toggle */}
      <div className="lg:hidden sticky top-0 z-30 bg-background/80 backdrop-blur border-b border-border px-4 py-3">
        <button
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          className="flex items-center gap-2 text-sm font-medium text-foreground"
        >
          {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          API Sections
        </button>
        {mobileNavOpen && (
          <div className="mt-3 pb-2">
            <SidebarNav
              activeSection={activeSection}
              onSelect={() => setMobileNavOpen(false)}
            />
          </div>
        )}
      </div>

      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="flex gap-8">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block w-56 shrink-0">
            <div className="sticky top-24">
              <div className="mb-4">
                <Link
                  href="/docs"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Back to Docs
                </Link>
              </div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Sections
              </h3>
              <SidebarNav activeSection={activeSection} />
              <div className="mt-6 pt-4 border-t border-border">
                <a
                  href="/api/openapi.json"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  OpenAPI Spec →
                </a>
              </div>
              <div className="mt-2">
                <Link
                  href="/docs"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Swagger UI →
                </Link>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">
            {/* Hero */}
            <div className="mb-10">
              <h1 className="text-3xl font-bold tracking-tight mb-3">
                REST API Reference
              </h1>
              <p className="text-muted-foreground max-w-2xl mb-4">
                Copy-pasteable curl examples for every major ugig.net API
                endpoint. All examples use{" "}
                <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono">
                  $API_KEY
                </code>{" "}
                as a placeholder — replace it with your actual API key.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/settings/api-keys"
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Get an API Key →
                </Link>
                <Link
                  href="/docs"
                  className="inline-flex items-center px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/50 transition-colors"
                >
                  Interactive Swagger UI
                </Link>
              </div>

              {/* Auth info box */}
              <div className="mt-6 p-4 rounded-lg border border-border bg-muted/30">
                <h3 className="text-sm font-semibold mb-2">
                  🔐 Authentication
                </h3>
                <p className="text-sm text-muted-foreground mb-2">
                  There are two ways to authenticate API requests:
                </p>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>
                    <strong className="text-foreground">API Key</strong> — Add{" "}
                    <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
                      X-API-Key: your_key
                    </code>{" "}
                    header. Create keys at{" "}
                    <Link href="/settings/api-keys" className="text-primary hover:underline">
                      /settings/api-keys
                    </Link>
                    .
                  </li>
                  <li>
                    <strong className="text-foreground">Bearer Token</strong> — Use the{" "}
                    <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
                      access_token
                    </code>{" "}
                    from{" "}
                    <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
                      POST /api/auth/login
                    </code>{" "}
                    as{" "}
                    <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
                      Authorization: Bearer token
                    </code>
                    .
                  </li>
                </ol>
              </div>
            </div>

            {/* Sections */}
            <div className="space-y-12">
              {SECTIONS.map((section) => (
                <section key={section.id} id={section.id}>
                  <div className="mb-4">
                    <h2 className="text-2xl font-bold tracking-tight">
                      {section.title}
                    </h2>
                    {section.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {section.description}
                      </p>
                    )}
                  </div>
                  <div className="space-y-4">
                    {section.endpoints.map((ep, i) => (
                      <EndpointCard key={`${section.id}-${i}`} endpoint={ep} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </main>
        </div>
      </div>

    </>
  );
}
