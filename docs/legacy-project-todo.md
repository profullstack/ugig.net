# ugig.net - Project Todo

## Phase 1: Project Setup & Foundation ✅

### Environment Setup
- [x] Initialize Next.js 15+ project with App Router
- [x] Configure TypeScript with strict mode
- [x] Set up Tailwind CSS with custom theme
- [x] Configure ESLint
- [x] Set up Supabase client library
- [x] Create environment variables template (.env.example)

### Supabase Setup
- [x] Create Supabase project
- [x] Set up database schema
- [x] Configure Row Level Security (RLS) policies
- [x] Set up Supabase Auth (email provider)
- [x] Create database functions and triggers
- [x] Set up storage buckets (avatars, attachments)

---

## Phase 2: Authentication & User Management ✅

### Authentication
- [x] Implement sign-up flow with email verification
- [x] Implement sign-in flow
- [x] Implement password reset flow
- [x] Create auth middleware for protected routes
- [x] Implement session management

### User Profiles
- [x] Create profile creation/onboarding flow
- [x] Build profile edit page
- [x] Implement avatar upload with Supabase Storage
- [x] Add skills/expertise tags system
- [x] Add portfolio links section
- [x] Add work history section
- [x] Create public profile view page (`/u/[username]`)
- [x] Add AI tools/experience section
- [x] Implement profile completion percentage indicator

---

## Phase 3: Gig Posting System

### Gig Creation
- [x] Create gig posting form
  - [x] Title, description
  - [x] Category/industry selection
  - [x] Required skills tags
  - [x] Budget type (fixed/hourly) and range
  - [x] Duration/timeline
  - [x] Remote/location preferences
  - [x] AI tools required/preferred
- [ ] Implement draft saving
- [ ] Add gig preview before publishing
- [ ] Implement 10 free posts/month limit tracking
- [x] Create gig edit functionality
- [x] Add gig close/archive functionality

### Gig Listing & Discovery
- [x] Build public gig listing page (no auth required)
- [x] Implement search functionality
  - [x] Full-text search on title/description
  - [x] Filter by category
  - [x] Filter by skills
  - [x] Filter by budget range
  - [x] Filter by posted date
  - [x] Sort options (newest, budget, etc.)
- [x] Create individual gig detail page (public)
- [x] Add pagination
- [x] Implement saved/bookmarked gigs (auth required)

---

## Phase 4: Application System

### Applying to Gigs
- [x] Create application form
  - [x] Cover letter/pitch
  - [x] Proposed rate/budget
  - [x] Estimated timeline
  - [x] Relevant portfolio items
  - [x] AI tools they'll use
- [x] Implement application submission (auth required)
- [x] Add application tracking for applicants
- [x] Create "My Applications" dashboard

### Managing Applications (Poster Side)
- [x] Build applications inbox for gig posters
- [x] Add application status management
- [ ] Implement bulk actions on applications
- [ ] Add applicant comparison view
- [x] Create quick view of applicant profiles

---

## Phase 5: Messaging System

### Chat
- [x] Set up SSE for real-time messaging
- [x] Create conversation data model
- [x] Build chat UI component
- [x] Implement real-time message sending/receiving
- [x] Add typing indicators
- [x] Add read receipts UI
- [x] Create conversations list/inbox
- [ ] Add file/attachment sharing in chat
- [ ] Implement chat search

### Notifications
- [x] Create notification system architecture
- [x] Implement in-app notifications
- [ ] Set up email notifications
- [ ] Add notification preferences settings
- [x] Create notification center UI

---

## Phase 6: Video Chat Integration

### Jitsi SDK Integration
- [x] Set up Jitsi Meet external API
- [x] Create video call initiation flow
- [x] Build video call room component
- [ ] Implement call scheduling
- [ ] Add calendar integration for scheduled calls
- [x] Create call history/logs
- [ ] Implement call notifications
- [ ] Add pre-call device check (camera/mic)

---

## Phase 7: Subscription & Payments

### Subscription System
- [x] Integrate Stripe for payments
- [x] Create subscription plans
  - [x] Free tier (10 posts/month)
  - [x] Pro tier ($5.99/month - unlimited posts)
- [x] Build subscription management page
- [ ] Implement usage tracking (posts count)
- [ ] Create upgrade prompts when limit reached
- [ ] Add billing history
- [x] Implement subscription cancellation flow
- [ ] Handle failed payments/grace period

### Payment Processing
- [x] Set up CoinPayPortal (crypto payments)
- [x] Set up Stripe webhooks
- [x] Implement secure checkout flow
- [ ] Add invoice generation
- [ ] Create payment receipts

---

## Phase 8: Dashboard & Analytics

### User Dashboards
- [x] Applicant dashboard (basic)
  - [x] Active applications
  - [ ] Saved gigs
  - [x] Messages overview
  - [ ] Profile views stats
- [x] Poster dashboard (basic)
  - [x] Active gigs
  - [x] Applications received
  - [ ] Hired workers tracking
  - [ ] Spending overview

### Admin Dashboard
- [ ] User management
- [ ] Gig moderation
- [ ] Reports/flags handling
- [ ] Platform analytics
- [ ] Subscription metrics

---

## Phase 9: Additional Features

### Reviews & Ratings
- [x] Create review system for completed gigs
- [x] Implement star ratings
- [x] Add written reviews
- [x] Display reviews on profiles
- [x] Calculate and show average ratings

### Search & Discovery Enhancements
- [ ] Implement AI-powered job matching
- [ ] Add "similar gigs" recommendations
- [ ] Create "featured gigs" section
- [ ] Build category landing pages

### Trust & Safety
- [ ] Implement user verification
- [ ] Add report/flag system
- [ ] Create content moderation tools
- [ ] Implement rate limiting
- [ ] Add spam detection

---

## Phase 10: Polish & Launch Prep

### UI/UX Refinement
- [ ] Responsive design audit
- [ ] Accessibility audit (WCAG 2.1)
- [x] Loading states and skeletons
- [x] Error handling and error pages
- [x] Empty states design
- [ ] Micro-interactions and animations

### Performance
- [ ] Image optimization
- [ ] Code splitting audit
- [ ] Database query optimization
- [ ] Add caching where appropriate
- [ ] Lighthouse performance audit

### SEO & Marketing
- [ ] Meta tags and Open Graph
- [ ] Sitemap generation
- [ ] robots.txt configuration
- [ ] Landing page optimization

### Documentation
- [ ] API documentation
- [ ] User guides/help center
- [ ] Terms of Service
- [ ] Privacy Policy
- [ ] FAQ page

### Testing
- [x] Unit tests for utilities
- [x] Unit tests for validations
- [x] Unit tests for components
- [ ] Integration tests for API routes
- [ ] E2E tests for critical flows
- [ ] Load testing

### Deployment
- [ ] Configure production environment
- [ ] Set up custom domain
- [ ] Configure SSL
- [ ] Set up monitoring (error tracking)
- [ ] Configure backups
- [ ] Create deployment pipeline

---

## Tech Stack Summary

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Real-time | SSE + Supabase Realtime |
| Storage | Supabase Storage |
| Video | Jitsi Meet SDK |
| Payments | Stripe + CoinPayPortal |
| Email | Resend (or Supabase) |

---

## Notes

- All job postings are public (no auth to view)
- Account required to apply or post
- Free tier: 10 posts/month for posters
- Pro tier: $5.99/month for unlimited
- Focus on AI-assisted workers as differentiator
