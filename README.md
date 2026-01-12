# ugig.net

A marketplace for AI-assisted engineers and skilled workers.

## Overview

ugig.net connects clients with professionals who leverage AI tools to deliver high-quality work. Unlike traditional freelance platforms, ugig.net emphasizes AI tool proficiency as a key differentiator.

## Key Features

- **Public Gig Listings** - Browse jobs without an account
- **AI-Focused Profiles** - Showcase your AI tool expertise
- **Direct Messaging** - Real-time chat with potential clients/workers
- **Video Interviews** - Built-in video calling via Jitsi
- **Simple Pricing** - Free tier with 10 posts/month, Pro at $5.99/month

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Real-time | Supabase Realtime |
| Storage | Supabase Storage |
| Video | Jitsi Meet SDK |
| Payments | Stripe |
| Deployment | Railway |

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- Supabase account
- Stripe account (for payments)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/ugig.net.git
cd ugig.net

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Run development server
npm run dev
```

### Environment Variables

See [docs/deployment.md](docs/deployment.md) for full setup instructions.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_JITSI_DOMAIN=
NEXT_PUBLIC_APP_URL=
```

## Documentation

- [Architecture](docs/architecture.md) - System design and data flow
- [Database Schema](docs/database-schema.md) - PostgreSQL tables and RLS policies
- [Features](docs/features.md) - Detailed feature specifications
- [API Design](docs/api-design.md) - Server actions and types
- [Tech Stack](docs/tech-stack.md) - Libraries and implementation details
- [Deployment](docs/deployment.md) - Railway and Supabase setup guide

## Project Status

See [todo.md](todo.md) for current progress and roadmap.

## License

MIT
