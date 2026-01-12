# ugig.net - Deployment Guide

## Overview

ugig.net is deployed using:
- **Railway** - Next.js application hosting
- **Supabase Cloud** - Database, Auth, Storage, Realtime
- **Stripe** - Payment processing

---

## Prerequisites

1. **Accounts Required**:
   - [Railway](https://railway.app) account
   - [Supabase](https://supabase.com) account
   - [Stripe](https://stripe.com) account
   - [GitHub](https://github.com) account (for deployment)

2. **Domain** (optional but recommended):
   - Custom domain for production (ugig.net)

---

## Supabase Setup

### 1. Create Project

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Click "New Project"
3. Select organization
4. Enter project details:
   - Name: `ugig-net`
   - Database Password: (save securely)
   - Region: Choose closest to your users
5. Click "Create new project"

### 2. Configure Authentication

1. Go to **Authentication > Providers**
2. Enable providers:
   - **Email**: Enable, configure templates
   - **Google** (optional): Add OAuth credentials
   - **GitHub** (optional): Add OAuth credentials

3. Go to **Authentication > URL Configuration**
   - Site URL: `https://ugig.net` (or your domain)
   - Redirect URLs: Add your app URLs

### 3. Run Database Migrations

1. Go to **SQL Editor**
2. Run the schema from [database-schema.md](./database-schema.md)
3. Or use Supabase CLI:

```bash
# Install CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref YOUR_PROJECT_REF

# Run migrations
supabase db push
```

### 4. Configure Storage

1. Go to **Storage**
2. Create buckets:
   - `avatars` - Public bucket for profile images
   - `attachments` - Private bucket for chat attachments

```sql
-- Storage policies
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false);

-- Avatar upload policy
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Attachment policies
CREATE POLICY "Users can upload attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'attachments' AND
  auth.uid() IS NOT NULL
);

CREATE POLICY "Conversation participants can view attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'attachments' AND
  auth.uid() IS NOT NULL
);
```

### 5. Get API Keys

1. Go to **Settings > API**
2. Copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

---

## Stripe Setup

### 1. Create Account & Get Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Get API keys from **Developers > API keys**:
   - Publishable key → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - Secret key → `STRIPE_SECRET_KEY`

### 2. Create Products & Prices

1. Go to **Products**
2. Create product: "ugig Pro"
3. Add price:
   - Amount: $5.99
   - Billing period: Monthly
   - Copy Price ID for checkout

### 3. Configure Webhook

1. Go to **Developers > Webhooks**
2. Add endpoint:
   - URL: `https://ugig.net/api/webhooks/stripe`
   - Events to listen:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
3. Copy Signing secret → `STRIPE_WEBHOOK_SECRET`

### 4. Configure Customer Portal

1. Go to **Settings > Billing > Customer portal**
2. Enable portal
3. Configure allowed actions

---

## Railway Deployment

### 1. Create Project

1. Go to [Railway](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Connect your GitHub account
5. Select the `ugig.net` repository

### 2. Configure Environment Variables

In Railway project settings, add:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_PRO_PRICE_ID=price_...

# Jitsi
NEXT_PUBLIC_JITSI_DOMAIN=meet.jit.si

# App
NEXT_PUBLIC_APP_URL=https://ugig.net
NODE_ENV=production
```

### 3. Configure Build Settings

Railway auto-detects Next.js, but verify:

- **Build Command**: `npm run build`
- **Start Command**: `npm start`
- **Install Command**: `npm install`

### 4. Deploy

1. Push to main branch triggers deploy
2. Or manually deploy from Railway dashboard

### 5. Custom Domain

1. In Railway, go to **Settings > Domains**
2. Add custom domain: `ugig.net`
3. Configure DNS:
   - Add CNAME record pointing to Railway
4. SSL is automatic

---

## Environment Variables Reference

| Variable | Description | Where to get |
|----------|-------------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Supabase Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role | Supabase Settings > API |
| `STRIPE_SECRET_KEY` | Stripe secret key | Stripe Developers > API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | Stripe Developers > Webhooks |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe public key | Stripe Developers > API keys |
| `STRIPE_PRO_PRICE_ID` | Pro plan price ID | Stripe Products |
| `NEXT_PUBLIC_JITSI_DOMAIN` | Jitsi server domain | Use `meet.jit.si` or self-hosted |
| `NEXT_PUBLIC_APP_URL` | Your app URL | Your domain |

---

## Local Development

### 1. Clone & Install

```bash
git clone https://github.com/your-org/ugig.net.git
cd ugig.net
npm install
```

### 2. Environment Setup

```bash
# Copy example env
cp .env.example .env.local

# Fill in your development keys
```

### 3. Run Development Server

```bash
npm run dev
```

### 4. Stripe CLI for Webhooks (Local)

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

---

## CI/CD Pipeline

Railway automatically deploys on push to main. For additional CI:

### GitHub Actions Example

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm run test
```

---

## Monitoring & Maintenance

### Error Tracking

Consider adding:
- [Sentry](https://sentry.io) for error tracking
- Railway logs for server logs

### Database Backups

Supabase Pro includes automatic backups. For additional:
- Enable Point-in-Time Recovery
- Set up manual backup schedule

### Performance Monitoring

- Railway provides basic metrics
- Consider [Vercel Analytics](https://vercel.com/analytics) compatible tools
- Supabase dashboard for database metrics

---

## Scaling Considerations

### When to Scale

- **Database**: Supabase Pro when approaching limits
- **Application**: Railway horizontal scaling
- **Storage**: CDN for static assets

### Supabase Limits (Free Tier)

- Database: 500MB
- Storage: 1GB
- Auth users: 50,000 MAU
- Realtime: 200 concurrent connections

### Railway Limits

- Memory: Configurable per service
- CPU: Shared by default, dedicated available
- Bandwidth: Pay per GB

---

## Troubleshooting

### Common Issues

**Deployment fails on Railway**
- Check build logs
- Verify environment variables
- Ensure all dependencies in package.json

**Supabase connection issues**
- Verify API keys
- Check RLS policies
- Ensure database is not paused (free tier)

**Stripe webhooks not working**
- Verify webhook URL is correct
- Check webhook secret
- Verify events are selected

**Auth not working**
- Check redirect URLs in Supabase
- Verify Site URL configuration
- Check OAuth provider setup
