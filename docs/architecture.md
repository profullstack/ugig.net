# ugig.net - System Architecture

## Overview

ugig.net is a marketplace platform connecting AI-assisted engineers and skilled workers with clients. Built with Next.js, Supabase, and deployed on Railway.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                     │
│                    (Web Browsers / Mobile Browsers)                      │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           RAILWAY                                        │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                        Next.js Application                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │  │
│  │  │   App       │  │   API       │  │   Server Components     │   │  │
│  │  │   Router    │  │   Routes    │  │   & Server Actions      │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    SUPABASE     │    │     STRIPE      │    │     JITSI       │
│                 │    │                 │    │                 │
│  ┌───────────┐  │    │  - Payments     │    │  - Video Chat   │
│  │ PostgreSQL│  │    │  - Subscriptions│    │  - Rooms API    │
│  │ Database  │  │    │  - Webhooks     │    │                 │
│  └───────────┘  │    │                 │    │                 │
│                 │    └─────────────────┘    └─────────────────┘
│  ┌───────────┐  │
│  │   Auth    │  │
│  │  Service  │  │
│  └───────────┘  │
│                 │
│  ┌───────────┐  │
│  │ Realtime  │  │
│  │  (Chat)   │  │
│  └───────────┘  │
│                 │
│  ┌───────────┐  │
│  │  Storage  │  │
│  │ (Files)   │  │
│  └───────────┘  │
└─────────────────┘
```

## Application Structure

```
ugig.net/
├── app/                      # Next.js App Router
│   ├── (auth)/              # Auth routes (login, signup, etc.)
│   │   ├── login/
│   │   ├── signup/
│   │   └── reset-password/
│   ├── (public)/            # Public routes (no auth required)
│   │   ├── gigs/            # Public gig listings
│   │   ├── u/[username]/    # Public profiles
│   │   └── page.tsx         # Landing page
│   ├── (dashboard)/         # Protected routes
│   │   ├── dashboard/       # User dashboard
│   │   ├── gigs/
│   │   │   ├── new/         # Create gig
│   │   │   └── [id]/edit/   # Edit gig
│   │   ├── applications/    # Manage applications
│   │   ├── messages/        # Chat/messaging
│   │   ├── calls/           # Video calls
│   │   ├── profile/         # Edit profile
│   │   └── settings/        # Account settings
│   ├── api/                 # API routes
│   │   ├── webhooks/
│   │   │   └── stripe/
│   │   └── ...
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                  # Base UI components
│   ├── forms/               # Form components
│   ├── gigs/                # Gig-related components
│   ├── chat/                # Messaging components
│   ├── video/               # Jitsi video components
│   └── layout/              # Layout components
├── lib/
│   ├── supabase/
│   │   ├── client.ts        # Browser client
│   │   ├── server.ts        # Server client
│   │   └── middleware.ts    # Auth middleware
│   ├── stripe/
│   ├── jitsi/
│   └── utils/
├── hooks/                   # Custom React hooks
├── types/                   # TypeScript types
├── docs/                    # Documentation
└── public/                  # Static assets
```

## Data Flow

### Authentication Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  User    │────▶│  Next.js │────▶│ Supabase │────▶│  User    │
│  Login   │     │  Route   │     │   Auth   │     │ Session  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                                        │
                                        ▼
                                  ┌──────────┐
                                  │   JWT    │
                                  │  Token   │
                                  └──────────┘
```

### Gig Application Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Applicant  │───▶│  View Gig   │───▶│   Apply     │───▶│ Notification│
│  Browses    │    │  (Public)   │    │  (Auth Req) │    │  to Poster  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                             │
                                             ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Hired     │◀───│  Interview  │◀───│   Review    │
│             │    │  (Video)    │    │ Application │
└─────────────┘    └─────────────┘    └─────────────┘
```

### Real-time Chat Flow

```
┌──────────┐                              ┌──────────┐
│  User A  │                              │  User B  │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  Send Message                           │
     ▼                                         │
┌──────────┐     ┌──────────────┐              │
│  Next.js │────▶│   Supabase   │              │
│  Client  │     │   Realtime   │              │
└──────────┘     └──────┬───────┘              │
                        │                       │
                        │  Broadcast            │
                        ▼                       ▼
                  ┌─────────────────────────────────┐
                  │         All Subscribers         │
                  └─────────────────────────────────┘
```

## Security Architecture

### Row Level Security (RLS)

All database tables use Supabase RLS policies:

- **profiles**: Users can only update their own profile
- **gigs**: Anyone can read, only owner can update/delete
- **applications**: Applicant and gig owner can read, only applicant can create
- **messages**: Only participants can read/write
- **subscriptions**: Only owner can read

### Authentication Layers

1. **Supabase Auth**: Handles user authentication
2. **Next.js Middleware**: Protects routes
3. **API Route Guards**: Validates session on API calls
4. **RLS Policies**: Database-level security

## Scalability Considerations

### Current Architecture (Launch)
- Single Railway deployment
- Supabase managed database
- Suitable for ~1,000-10,000 users

### Future Scaling Options
- Railway horizontal scaling
- Supabase Pro for higher limits
- CDN for static assets
- Database read replicas
- Edge functions for global performance

## External Services

| Service | Purpose | Integration Point |
|---------|---------|-------------------|
| Supabase | Database, Auth, Realtime, Storage | SDK + REST API |
| Stripe | Payments & Subscriptions | SDK + Webhooks |
| Jitsi | Video Calling | External API (iframe) |
| Resend | Transactional Email | REST API |
| Railway | Hosting & Deployment | Git integration |

## Environment Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Jitsi
NEXT_PUBLIC_JITSI_DOMAIN=

# App
NEXT_PUBLIC_APP_URL=
```
