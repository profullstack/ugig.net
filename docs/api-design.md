# ugig.net - API Design

## Overview

The API uses Next.js App Router conventions with:
- Server Actions for mutations
- API Routes for webhooks and external integrations
- Supabase client for data access (with RLS)

## API Structure

```
app/
├── api/
│   ├── webhooks/
│   │   └── stripe/
│   │       └── route.ts        # Stripe webhook handler
│   └── cron/
│       └── cleanup/
│           └── route.ts        # Scheduled cleanup tasks
├── actions/
│   ├── auth.ts                 # Auth-related actions
│   ├── gigs.ts                 # Gig CRUD actions
│   ├── applications.ts         # Application actions
│   ├── messages.ts             # Messaging actions
│   ├── profiles.ts             # Profile actions
│   └── subscriptions.ts        # Billing actions
```

---

## Server Actions

### Auth Actions (`actions/auth.ts`)

```typescript
// Sign up with email
'use server'
export async function signUp(formData: FormData): Promise<ActionResult>

// Sign in with email
'use server'
export async function signIn(formData: FormData): Promise<ActionResult>

// Sign out
'use server'
export async function signOut(): Promise<void>

// Reset password request
'use server'
export async function resetPassword(email: string): Promise<ActionResult>

// Update password
'use server'
export async function updatePassword(
  newPassword: string
): Promise<ActionResult>
```

### Profile Actions (`actions/profiles.ts`)

```typescript
// Get public profile by username
'use server'
export async function getProfile(username: string): Promise<Profile | null>

// Update own profile
'use server'
export async function updateProfile(
  data: ProfileUpdateInput
): Promise<ActionResult<Profile>>

// Upload avatar
'use server'
export async function uploadAvatar(
  formData: FormData
): Promise<ActionResult<string>> // Returns URL

// Update availability status
'use server'
export async function updateAvailability(
  isAvailable: boolean
): Promise<ActionResult>
```

### Gig Actions (`actions/gigs.ts`)

```typescript
// Types
interface GigInput {
  title: string
  description: string
  category: string
  skills_required: string[]
  ai_tools_preferred: string[]
  budget_type: 'fixed' | 'hourly'
  budget_min?: number
  budget_max?: number
  duration?: string
  location_type: 'remote' | 'onsite' | 'hybrid'
  location?: string
}

interface GigFilters {
  search?: string
  category?: string
  skills?: string[]
  ai_tools?: string[]
  budget_min?: number
  budget_max?: number
  location_type?: string
  posted_within?: 'day' | 'week' | 'month'
}

// Create new gig
'use server'
export async function createGig(data: GigInput): Promise<ActionResult<Gig>>

// Update gig
'use server'
export async function updateGig(
  id: string,
  data: Partial<GigInput>
): Promise<ActionResult<Gig>>

// Delete gig
'use server'
export async function deleteGig(id: string): Promise<ActionResult>

// Update gig status
'use server'
export async function updateGigStatus(
  id: string,
  status: GigStatus
): Promise<ActionResult>

// Get gigs with filters (public, no auth required)
'use server'
export async function getGigs(
  filters: GigFilters,
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResult<Gig>>

// Get single gig (public)
'use server'
export async function getGig(id: string): Promise<Gig | null>

// Get user's gigs
'use server'
export async function getMyGigs(): Promise<Gig[]>

// Save/bookmark gig
'use server'
export async function saveGig(gigId: string): Promise<ActionResult>

// Unsave gig
'use server'
export async function unsaveGig(gigId: string): Promise<ActionResult>

// Get saved gigs
'use server'
export async function getSavedGigs(): Promise<Gig[]>
```

### Application Actions (`actions/applications.ts`)

```typescript
interface ApplicationInput {
  gig_id: string
  cover_letter: string
  proposed_rate?: number
  proposed_timeline?: string
  portfolio_items?: string[]
  ai_tools_to_use?: string[]
}

// Submit application
'use server'
export async function submitApplication(
  data: ApplicationInput
): Promise<ActionResult<Application>>

// Withdraw application
'use server'
export async function withdrawApplication(
  id: string
): Promise<ActionResult>

// Get my applications
'use server'
export async function getMyApplications(
  status?: ApplicationStatus
): Promise<Application[]>

// Get applications for a gig (poster only)
'use server'
export async function getGigApplications(
  gigId: string,
  status?: ApplicationStatus
): Promise<ApplicationWithApplicant[]>

// Update application status (poster only)
'use server'
export async function updateApplicationStatus(
  id: string,
  status: ApplicationStatus
): Promise<ActionResult>

// Bulk update application statuses
'use server'
export async function bulkUpdateApplicationStatus(
  ids: string[],
  status: ApplicationStatus
): Promise<ActionResult>
```

### Messaging Actions (`actions/messages.ts`)

```typescript
// Get or create conversation
'use server'
export async function getOrCreateConversation(
  participantId: string,
  gigId?: string
): Promise<Conversation>

// Get user's conversations
'use server'
export async function getConversations(): Promise<ConversationPreview[]>

// Get messages in conversation
'use server'
export async function getMessages(
  conversationId: string,
  cursor?: string,
  limit?: number
): Promise<PaginatedResult<Message>>

// Send message
'use server'
export async function sendMessage(
  conversationId: string,
  content: string,
  attachments?: Attachment[]
): Promise<ActionResult<Message>>

// Mark messages as read
'use server'
export async function markAsRead(
  conversationId: string
): Promise<ActionResult>

// Upload attachment
'use server'
export async function uploadAttachment(
  formData: FormData
): Promise<ActionResult<Attachment>>
```

### Subscription Actions (`actions/subscriptions.ts`)

```typescript
// Get current subscription
'use server'
export async function getSubscription(): Promise<Subscription | null>

// Create checkout session for upgrade
'use server'
export async function createCheckoutSession(): Promise<ActionResult<{
  url: string
}>>

// Create portal session for management
'use server'
export async function createPortalSession(): Promise<ActionResult<{
  url: string
}>>

// Get usage for current month
'use server'
export async function getUsage(): Promise<{
  posts_used: number
  posts_limit: number
  can_post: boolean
}>

// Cancel subscription
'use server'
export async function cancelSubscription(): Promise<ActionResult>
```

### Video Call Actions (`actions/video-calls.ts`)

```typescript
// Create instant call
'use server'
export async function createCall(
  participantId: string,
  gigId?: string
): Promise<ActionResult<VideoCall>>

// Schedule call
'use server'
export async function scheduleCall(
  participantId: string,
  scheduledAt: Date,
  gigId?: string
): Promise<ActionResult<VideoCall>>

// Get upcoming calls
'use server'
export async function getUpcomingCalls(): Promise<VideoCall[]>

// Get call history
'use server'
export async function getCallHistory(
  limit?: number
): Promise<VideoCall[]>

// End call (update ended_at)
'use server'
export async function endCall(callId: string): Promise<ActionResult>
```

### Review Actions (`actions/reviews.ts`)

```typescript
interface ReviewInput {
  gig_id: string
  reviewee_id: string
  rating: number // 1-5
  comment?: string
}

// Create review
'use server'
export async function createReview(
  data: ReviewInput
): Promise<ActionResult<Review>>

// Get reviews for user
'use server'
export async function getUserReviews(
  userId: string
): Promise<Review[]>

// Get average rating for user
'use server'
export async function getUserRating(
  userId: string
): Promise<{ average: number; count: number }>
```

### Notification Actions (`actions/notifications.ts`)

```typescript
// Get notifications
'use server'
export async function getNotifications(
  unreadOnly?: boolean
): Promise<Notification[]>

// Mark notification as read
'use server'
export async function markNotificationRead(
  id: string
): Promise<ActionResult>

// Mark all as read
'use server'
export async function markAllNotificationsRead(): Promise<ActionResult>

// Get unread count
'use server'
export async function getUnreadCount(): Promise<number>
```

---

## API Routes

### Stripe Webhook (`app/api/webhooks/stripe/route.ts`)

```typescript
export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  // Verify webhook signature
  // Handle events:
  // - checkout.session.completed
  // - customer.subscription.updated
  // - customer.subscription.deleted
  // - invoice.payment_failed
}
```

### Cron Jobs (if needed)

```typescript
// app/api/cron/cleanup/route.ts
export async function GET(request: Request) {
  // Verify cron secret
  // Clean up expired data, send reminders, etc.
}
```

---

## Types

### Common Types (`types/index.ts`)

```typescript
// Action result wrapper
interface ActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

// Pagination
interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

// User/Profile
interface Profile {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  skills: string[]
  ai_tools: string[]
  hourly_rate: number | null
  portfolio_urls: string[]
  location: string | null
  timezone: string | null
  is_available: boolean
  profile_completed: boolean
  created_at: string
  updated_at: string
}

// Gig
type GigStatus = 'draft' | 'active' | 'paused' | 'closed' | 'filled'
type BudgetType = 'fixed' | 'hourly'
type LocationType = 'remote' | 'onsite' | 'hybrid'

interface Gig {
  id: string
  poster_id: string
  poster?: Profile
  title: string
  description: string
  category: string
  skills_required: string[]
  ai_tools_preferred: string[]
  budget_type: BudgetType
  budget_min: number | null
  budget_max: number | null
  duration: string | null
  location_type: LocationType
  location: string | null
  status: GigStatus
  applications_count: number
  views_count: number
  created_at: string
  updated_at: string
}

// Application
type ApplicationStatus =
  | 'pending'
  | 'reviewing'
  | 'shortlisted'
  | 'rejected'
  | 'accepted'
  | 'withdrawn'

interface Application {
  id: string
  gig_id: string
  gig?: Gig
  applicant_id: string
  applicant?: Profile
  cover_letter: string
  proposed_rate: number | null
  proposed_timeline: string | null
  portfolio_items: string[]
  ai_tools_to_use: string[]
  status: ApplicationStatus
  created_at: string
  updated_at: string
}

// Messaging
interface Conversation {
  id: string
  participant_ids: string[]
  participants?: Profile[]
  gig_id: string | null
  gig?: Gig
  last_message_at: string
  created_at: string
  updated_at: string
}

interface Message {
  id: string
  conversation_id: string
  sender_id: string
  sender?: Profile
  content: string
  attachments: Attachment[]
  read_by: string[]
  created_at: string
}

interface Attachment {
  name: string
  url: string
  type: string
  size: number
}

// Subscription
type SubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'past_due'
  | 'trialing'
  | 'incomplete'

type SubscriptionPlan = 'free' | 'pro'

interface Subscription {
  id: string
  user_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  status: SubscriptionStatus
  plan: SubscriptionPlan
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  created_at: string
  updated_at: string
}

// Video Calls
interface VideoCall {
  id: string
  room_id: string
  initiator_id: string
  initiator?: Profile
  participant_ids: string[]
  participants?: Profile[]
  gig_id: string | null
  application_id: string | null
  scheduled_at: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
}

// Reviews
interface Review {
  id: string
  gig_id: string
  reviewer_id: string
  reviewer?: Profile
  reviewee_id: string
  reviewee?: Profile
  rating: number
  comment: string | null
  created_at: string
}

// Notifications
type NotificationType =
  | 'new_application'
  | 'application_status'
  | 'new_message'
  | 'call_scheduled'
  | 'review_received'
  | 'gig_update'

interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string | null
  data: Record<string, any>
  read_at: string | null
  created_at: string
}
```

---

## Error Handling

All server actions return `ActionResult`:

```typescript
// Success
return { success: true, data: result }

// Error
return { success: false, error: 'Error message' }
```

Common error codes:
- `UNAUTHORIZED` - Not logged in
- `FORBIDDEN` - No permission
- `NOT_FOUND` - Resource not found
- `VALIDATION_ERROR` - Invalid input
- `LIMIT_EXCEEDED` - Free tier limit reached
- `INTERNAL_ERROR` - Server error

---

## Real-time Subscriptions

Using Supabase Realtime for:

### Messages
```typescript
// Subscribe to new messages in conversation
supabase
  .channel(`conversation:${conversationId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`
    },
    (payload) => {
      // Handle new message
    }
  )
  .subscribe()
```

### Notifications
```typescript
// Subscribe to user's notifications
supabase
  .channel(`notifications:${userId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`
    },
    (payload) => {
      // Handle new notification
    }
  )
  .subscribe()
```

### Typing Indicators
```typescript
// Broadcast channel for typing
const channel = supabase.channel(`typing:${conversationId}`)

// Send typing event
channel.send({
  type: 'broadcast',
  event: 'typing',
  payload: { user_id: currentUserId }
})

// Listen for typing
channel.on('broadcast', { event: 'typing' }, (payload) => {
  // Show typing indicator
})
```
