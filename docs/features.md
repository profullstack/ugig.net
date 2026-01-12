# ugig.net - Features Specification

## Core Value Proposition

ugig.net is a marketplace platform specifically designed for AI-assisted professionals. Unlike traditional freelance platforms, ugig.net emphasizes:

1. **AI Tool Proficiency**: Users showcase their expertise with AI tools (ChatGPT, Claude, Copilot, Midjourney, etc.)
2. **Low-Friction Entry**: Free to browse, free to apply, affordable subscription
3. **Direct Communication**: Inline chat and video calling for seamless hiring

---

## User Types

### Workers/Applicants
- Browse and apply to gigs
- Showcase AI tool expertise on profile
- Communicate with potential clients
- Track application status

### Clients/Posters
- Post gigs requesting AI-assisted work
- Review applications
- Communicate with and hire workers
- Manage active projects

### Both Roles
- Any user can be both a worker and client
- Single account, dual functionality
- Shared subscription applies to both activities

---

## Feature Details

### 1. Public Gig Listings

**Visibility**: No authentication required to browse

**Search & Filter Options**:
- Full-text search (title, description)
- Category filter (Development, Design, Writing, Data, Marketing, etc.)
- Skills filter (multi-select)
- AI Tools filter (ChatGPT, Claude, Copilot, Midjourney, etc.)
- Budget range slider
- Location type (Remote, Onsite, Hybrid)
- Posted date (Last 24h, Week, Month)

**Sort Options**:
- Newest first (default)
- Budget: High to Low
- Budget: Low to High
- Most applications

**Gig Card Display**:
```
┌────────────────────────────────────────────────────┐
│ [Category Badge]                         [Saved ♡] │
│                                                    │
│ Gig Title Here                                     │
│ Company/Poster Name • Posted 2 days ago            │
│                                                    │
│ Brief description excerpt limited to 2 lines...    │
│                                                    │
│ [Skill] [Skill] [AI Tool] [+3 more]               │
│                                                    │
│ $500-$1,000 Fixed  •  Remote  •  12 applications  │
└────────────────────────────────────────────────────┘
```

---

### 2. User Profiles

**Public Profile URL**: `ugig.net/u/[username]`

**Profile Sections**:

```
┌─────────────────────────────────────────────────────────────┐
│  [Avatar]  John Smith                                       │
│            @johnsmith • San Francisco, CA                   │
│            ★ 4.8 (23 reviews) • Available for work ✓        │
│                                                             │
│  [Message] [Schedule Call]                                  │
├─────────────────────────────────────────────────────────────┤
│  About                                                      │
│  Full-stack developer specializing in AI-integrated        │
│  applications. 5+ years experience building scalable...    │
├─────────────────────────────────────────────────────────────┤
│  AI Tools & Expertise                                       │
│  [Claude ★★★★★] [ChatGPT ★★★★☆] [Copilot ★★★★★]           │
│  [Midjourney ★★★☆☆] [Cursor ★★★★☆]                         │
├─────────────────────────────────────────────────────────────┤
│  Skills                                                     │
│  [React] [Node.js] [Python] [TypeScript] [PostgreSQL]      │
├─────────────────────────────────────────────────────────────┤
│  Portfolio                                                  │
│  • github.com/johnsmith                                     │
│  • johnsmith.dev                                            │
│  • dribbble.com/johnsmith                                   │
├─────────────────────────────────────────────────────────────┤
│  Reviews                                                    │
│  ★★★★★ "Excellent work with AI integration..."             │
│  - Client Name, Project Title                               │
└─────────────────────────────────────────────────────────────┘
```

**AI Tools Section (Unique Feature)**:
- Users list AI tools they use
- Self-rated proficiency (1-5 stars)
- Examples: ChatGPT, Claude, Copilot, Cursor, Midjourney, DALL-E, Stable Diffusion, etc.

---

### 3. Gig Posting

**Required Fields**:
- Title (max 100 chars)
- Description (rich text, max 5000 chars)
- Category (single select)
- Budget type (Fixed or Hourly)
- Budget range (min/max)

**Optional Fields**:
- Required skills (tags)
- Preferred AI tools (tags)
- Duration/timeline
- Location type (Remote/Onsite/Hybrid)
- Location (if onsite/hybrid)
- Attachments

**Gig Status Lifecycle**:
```
Draft → Active → [Paused] → Closed/Filled
```

**Posting Limits**:
- Free tier: 10 posts per calendar month
- Pro tier ($5.99/mo): Unlimited posts

---

### 4. Application System

**Application Form**:
```
┌─────────────────────────────────────────────────────────────┐
│  Apply to: [Gig Title]                                      │
├─────────────────────────────────────────────────────────────┤
│  Cover Letter / Pitch *                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Rich text editor                                     │   │
│  │ Explain why you're a great fit...                   │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  Your Proposed Rate                                         │
│  [$ ______] per [hour ▼] or [Fixed: $ ______]              │
├─────────────────────────────────────────────────────────────┤
│  Estimated Timeline                                         │
│  [______________________________]                           │
├─────────────────────────────────────────────────────────────┤
│  AI Tools You'll Use                                        │
│  [Claude ×] [Copilot ×] [+ Add]                            │
├─────────────────────────────────────────────────────────────┤
│  Relevant Portfolio Items (optional)                        │
│  [+ Add link]                                               │
├─────────────────────────────────────────────────────────────┤
│                                    [Cancel] [Submit Apply]  │
└─────────────────────────────────────────────────────────────┘
```

**Application Status Flow**:
```
Pending → Reviewing → Shortlisted → Accepted
                   ↘ Rejected

(Applicant can Withdraw at any time before Accepted)
```

**For Applicants - My Applications View**:
- List of all applications with status
- Filter by status
- Quick view of gig details
- Action to withdraw

**For Posters - Applications Inbox**:
- List of applications per gig
- Quick applicant profile preview
- Status management buttons
- Bulk actions (reject multiple)
- Compare applicants side-by-side

---

### 5. Messaging System

**Conversation Types**:
1. Direct message (user to user)
2. Gig-related (linked to specific gig/application)

**Chat Features**:
- Real-time messaging (Supabase Realtime)
- Typing indicators
- Read receipts
- File attachments (images, docs)
- Message timestamps
- Unread count badges

**Chat UI**:
```
┌─────────────────────────────────────────────────────────────┐
│  Conversations                    [🔍 Search]               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │ [Avatar] Jane D │  │  Jane Doe                       │  │
│  │ Last message... │  │  RE: Full-Stack Developer Gig   │  │
│  │ 2m ago      (2) │  │                                 │  │
│  ├─────────────────┤  │  ┌─────────────────────────┐    │  │
│  │ [Avatar] Bob S  │  │  │ Hi! I saw your profile │    │  │
│  │ Thanks for...   │  │  │ and I think you'd be   │    │  │
│  │ 1h ago          │  │  │ perfect for this role. │    │  │
│  ├─────────────────┤  │  └─────────────────────────┘    │  │
│  │                 │  │                          2:30 PM│  │
│  │                 │  │                                 │  │
│  │                 │  │  ┌─────────────────────────┐    │  │
│  │                 │  │  │ Thanks! I'd love to    │    │  │
│  │                 │  │  │ discuss further.       │    │  │
│  │                 │  │  └─────────────────────────┘    │  │
│  │                 │  │                          2:32 PM│  │
│  │                 │  ├─────────────────────────────────┤  │
│  │                 │  │ [📎] [Type a message...] [Send]│  │
│  └─────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

### 6. Video Calling (Jitsi Integration)

**Features**:
- Instant video calls from chat
- Scheduled video calls with calendar
- Pre-call device check (camera/mic)
- Screen sharing
- Call recording (optional)
- Call history/logs

**Integration Flow**:
```
Chat → [📹 Start Video Call] → Jitsi Room Opens
        or
Schedule → Calendar Event → Reminder → Join Call
```

**UI Components**:
- Start call button in chat header
- Schedule call modal
- Video call room (embedded Jitsi)
- Upcoming calls in dashboard

---

### 7. Subscription & Billing

**Pricing Tiers**:

| Feature | Free | Pro ($5.99/mo) |
|---------|------|----------------|
| Browse gigs | ✓ | ✓ |
| Apply to gigs | ✓ | ✓ |
| Post gigs | 10/month | Unlimited |
| Messaging | ✓ | ✓ |
| Video calls | ✓ | ✓ |
| Profile | ✓ | ✓ |

**Upgrade Prompts**:
- When user exceeds 10 posts: Modal to upgrade
- Dashboard showing usage: "8 of 10 posts used this month"
- Gentle reminders, not blockers

**Billing Management**:
- View current plan
- Upgrade/downgrade
- Cancel subscription
- Billing history
- Update payment method

---

### 8. Notifications

**In-App Notifications**:
- New application received
- Application status changed
- New message
- Video call scheduled/reminder
- Review received

**Email Notifications** (configurable):
- Daily digest option
- Instant for important events
- Weekly summary

**Notification Center**:
```
┌───────────────────────────────────────┐
│  Notifications                   [⚙️] │
├───────────────────────────────────────┤
│  🔵 New application from John S.     │
│     Full-Stack Developer Gig          │
│     2 minutes ago                     │
├───────────────────────────────────────┤
│  💬 New message from Jane D.         │
│     "Thanks for the quick response!"  │
│     15 minutes ago                    │
├───────────────────────────────────────┤
│  ⭐ Sarah left you a 5-star review   │
│     "Excellent work with AI..."       │
│     1 hour ago                        │
└───────────────────────────────────────┘
```

---

### 9. Reviews & Ratings

**Review Criteria**:
- Star rating (1-5)
- Written review
- Both parties can review after gig completion

**Display**:
- Average rating on profile
- Individual reviews listed
- Total review count

---

### 10. Dashboard

**Applicant Dashboard**:
```
┌─────────────────────────────────────────────────────────────┐
│  Welcome back, John!                                        │
├─────────────────────────────────────────────────────────────┤
│  Quick Stats                                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │    5     │ │    2     │ │    12    │ │   4.8    │       │
│  │ Active   │ │Shortlist │ │ Profile  │ │ Rating   │       │
│  │   Apps   │ │    ed    │ │  Views   │ │          │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
├─────────────────────────────────────────────────────────────┤
│  Recent Applications                          [View All →]  │
│  • Full-Stack Developer - Pending - Applied 2d ago         │
│  • AI Integration Specialist - Reviewing - Applied 5d ago  │
├─────────────────────────────────────────────────────────────┤
│  Recommended Gigs                             [View All →]  │
│  [Gig cards based on skills/AI tools]                      │
└─────────────────────────────────────────────────────────────┘
```

**Poster Dashboard**:
```
┌─────────────────────────────────────────────────────────────┐
│  Welcome back, John!                                        │
├─────────────────────────────────────────────────────────────┤
│  Quick Stats                                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │    3     │ │    15    │ │    2     │ │  8/10    │       │
│  │ Active   │ │   Apps   │ │ Hired    │ │ Posts    │       │
│  │  Gigs    │ │ Received │ │This Month│ │ Left     │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
├─────────────────────────────────────────────────────────────┤
│  Your Active Gigs                             [+ Post Gig]  │
│  • Full-Stack Developer - 8 applications - Posted 3d ago   │
│  • UI/UX Designer - 5 applications - Posted 1w ago         │
├─────────────────────────────────────────────────────────────┤
│  Recent Applications                          [View All →]  │
│  [Applicant cards with quick actions]                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Categories

1. **Development**
   - Web Development
   - Mobile Development
   - Backend/API
   - AI/ML Development
   - DevOps
   - Blockchain

2. **Design**
   - UI/UX Design
   - Graphic Design
   - AI Art/Images
   - Video Production
   - 3D/Animation

3. **Writing & Content**
   - Content Writing
   - Copywriting
   - Technical Writing
   - AI-Assisted Writing
   - Translation

4. **Data**
   - Data Analysis
   - Data Science
   - Data Entry
   - Research

5. **Marketing**
   - Digital Marketing
   - SEO
   - Social Media
   - Email Marketing

6. **Business**
   - Virtual Assistant
   - Project Management
   - Consulting
   - Customer Support

---

## AI Tools Taxonomy

Pre-defined list users can select from:

**LLMs/Chatbots**:
- ChatGPT (OpenAI)
- Claude (Anthropic)
- Gemini (Google)
- Llama (Meta)

**Code Assistants**:
- GitHub Copilot
- Cursor
- Codeium
- Tabnine

**Image Generation**:
- Midjourney
- DALL-E
- Stable Diffusion
- Adobe Firefly

**Video/Audio**:
- Runway
- ElevenLabs
- Synthesia

**Other**:
- Notion AI
- Jasper
- Copy.ai
- Custom/Other (user input)
