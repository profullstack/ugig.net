# ugig.net - Project Todo

## Phase 1: Project Setup & Foundation

### Environment Setup
- [ ] Initialize Next.js 14+ project with App Router
- [ ] Configure TypeScript with strict mode
- [ ] Set up Tailwind CSS with custom theme (brand colors, typography)
- [ ] Configure ESLint and Prettier
- [ ] Set up Supabase client library
- [ ] Create environment variables template (.env.example)
- [ ] Configure Railway deployment settings

### Supabase Setup
- [ ] Create Supabase project
- [ ] Set up database schema (see docs/database-schema.md)
- [ ] Configure Row Level Security (RLS) policies
- [ ] Set up Supabase Auth (email, Google, GitHub providers)
- [ ] Create database functions and triggers
- [ ] Set up storage buckets (avatars, attachments)

---

## Phase 2: Authentication & User Management

### Authentication
- [ ] Implement sign-up flow with email verification
- [ ] Implement sign-in flow
- [ ] Implement password reset flow
- [ ] Add OAuth providers (Google, GitHub)
- [ ] Create auth middleware for protected routes
- [ ] Implement session management

### User Profiles
- [ ] Create profile creation/onboarding flow
- [ ] Build profile edit page
- [ ] Implement avatar upload with Supabase Storage
- [ ] Add skills/expertise tags system
- [ ] Add portfolio links section
- [ ] Add work history section
- [ ] Create public profile view page (`/u/[username]`)
- [ ] Add AI tools/experience section (unique to ugig)
- [ ] Implement profile completion percentage indicator

---

## Phase 3: Gig Posting System

### Gig Creation
- [ ] Create gig posting form
  - [ ] Title, description (rich text editor)
  - [ ] Category/industry selection
  - [ ] Required skills tags
  - [ ] Budget type (fixed/hourly) and range
  - [ ] Duration/timeline
  - [ ] Remote/location preferences
  - [ ] AI tools required/preferred
- [ ] Implement draft saving
- [ ] Add gig preview before publishing
- [ ] Implement 10 free posts/month limit tracking
- [ ] Create gig edit functionality
- [ ] Add gig close/archive functionality

### Gig Listing & Discovery
- [ ] Build public gig listing page (no auth required)
- [ ] Implement search functionality
  - [ ] Full-text search on title/description
  - [ ] Filter by category
  - [ ] Filter by skills
  - [ ] Filter by budget range
  - [ ] Filter by posted date
  - [ ] Sort options (newest, budget, etc.)
- [ ] Create individual gig detail page (public)
- [ ] Add pagination/infinite scroll
- [ ] Implement saved/bookmarked gigs (auth required)

---

## Phase 4: Application System

### Applying to Gigs
- [ ] Create application form
  - [ ] Cover letter/pitch
  - [ ] Proposed rate/budget
  - [ ] Estimated timeline
  - [ ] Relevant portfolio items
  - [ ] AI tools they'll use
- [ ] Implement application submission (auth required)
- [ ] Add application tracking for applicants
- [ ] Create "My Applications" dashboard

### Managing Applications (Poster Side)
- [ ] Build applications inbox for gig posters
- [ ] Add application status management (pending, reviewing, shortlisted, rejected, accepted)
- [ ] Implement bulk actions on applications
- [ ] Add applicant comparison view
- [ ] Create quick view of applicant profiles

---

## Phase 5: Messaging System

### Inline Chat
- [ ] Set up Supabase Realtime for chat
- [ ] Create conversation data model
- [ ] Build chat UI component
- [ ] Implement real-time message sending/receiving
- [ ] Add typing indicators
- [ ] Add read receipts
- [ ] Implement message notifications
- [ ] Create conversations list/inbox
- [ ] Add file/attachment sharing in chat
- [ ] Implement chat search

### Notifications
- [ ] Create notification system architecture
- [ ] Implement in-app notifications
- [ ] Set up email notifications (Supabase/Resend)
- [ ] Add notification preferences settings
- [ ] Create notification center UI

---

## Phase 6: Video Chat Integration

### Jitsi SDK Integration
- [ ] Set up Jitsi Meet external API
- [ ] Create video call initiation flow
- [ ] Build video call room component
- [ ] Implement call scheduling
- [ ] Add calendar integration for scheduled calls
- [ ] Create call history/logs
- [ ] Implement call notifications
- [ ] Add pre-call device check (camera/mic)

---

## Phase 7: Subscription & Payments

### Subscription System
- [ ] Integrate Stripe for payments
- [ ] Create subscription plans
  - [ ] Free tier (10 posts/month)
  - [ ] Pro tier ($5.99/month - unlimited posts)
- [ ] Build subscription management page
- [ ] Implement usage tracking (posts count)
- [ ] Create upgrade prompts when limit reached
- [ ] Add billing history
- [ ] Implement subscription cancellation flow
- [ ] Handle failed payments/grace period

### Payment Processing
- [ ] Set up Stripe webhooks
- [ ] Implement secure checkout flow
- [ ] Add invoice generation
- [ ] Create payment receipts

---

## Phase 8: Dashboard & Analytics

### User Dashboards
- [ ] Applicant dashboard
  - [ ] Active applications
  - [ ] Saved gigs
  - [ ] Messages overview
  - [ ] Profile views stats
- [ ] Poster dashboard
  - [ ] Active gigs
  - [ ] Applications received
  - [ ] Hired workers
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
- [ ] Create review system for completed gigs
- [ ] Implement star ratings
- [ ] Add written reviews
- [ ] Display reviews on profiles
- [ ] Calculate and show average ratings

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
- [ ] Loading states and skeletons
- [ ] Error handling and error pages
- [ ] Empty states design
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
- [ ] Blog/content section (optional)

### Documentation
- [ ] API documentation
- [ ] User guides/help center
- [ ] Terms of Service
- [ ] Privacy Policy
- [ ] FAQ page

### Testing
- [ ] Unit tests for utilities
- [ ] Integration tests for API routes
- [ ] E2E tests for critical flows
- [ ] Load testing

### Deployment
- [ ] Configure Railway production environment
- [ ] Set up custom domain
- [ ] Configure SSL
- [ ] Set up monitoring (error tracking)
- [ ] Configure backups
- [ ] Create deployment pipeline

---

## Tech Stack Summary

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Real-time | Supabase Realtime |
| Storage | Supabase Storage |
| Video | Jitsi Meet SDK |
| Payments | Stripe |
| Deployment | Railway |
| Email | Resend (or Supabase) |

---

## Notes

- All job postings are public (no auth to view)
- Account required to apply or post
- Free tier: 10 posts/month for both posters and applicants
- Pro tier: $5.99/month for unlimited
- Focus on AI-assisted workers as differentiator
