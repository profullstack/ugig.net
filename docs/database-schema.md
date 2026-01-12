# ugig.net - Database Schema

## Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│     profiles    │       │      gigs       │       │  applications   │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK, FK)     │──┐    │ id (PK)         │──┐    │ id (PK)         │
│ username        │  │    │ poster_id (FK)  │◀─┼────│ gig_id (FK)     │
│ full_name       │  │    │ title           │  │    │ applicant_id(FK)│──┐
│ avatar_url      │  ├───▶│ description     │  │    │ cover_letter    │  │
│ bio             │  │    │ category        │  │    │ proposed_rate   │  │
│ skills          │  │    │ skills_required │  │    │ status          │  │
│ ai_tools        │  │    │ budget_type     │  │    │ created_at      │  │
│ hourly_rate     │  │    │ budget_min      │  └────│ updated_at      │  │
│ portfolio_urls  │  │    │ budget_max      │       └─────────────────┘  │
│ location        │  │    │ duration        │                            │
│ is_available    │  │    │ location_type   │       ┌─────────────────┐  │
│ created_at      │  │    │ status          │       │  conversations  │  │
│ updated_at      │  │    │ created_at      │       ├─────────────────┤  │
└─────────────────┘  │    │ updated_at      │       │ id (PK)         │  │
         ▲           │    └─────────────────┘       │ participant_ids │◀─┤
         │           │                              │ gig_id (FK)     │  │
         │           │    ┌─────────────────┐       │ created_at      │  │
         │           │    │    messages     │       │ updated_at      │  │
         │           │    ├─────────────────┤       └─────────────────┘  │
         │           │    │ id (PK)         │                            │
         │           └───▶│ conversation_id │       ┌─────────────────┐  │
         │                │ sender_id (FK)  │       │  subscriptions  │  │
         │                │ content         │       ├─────────────────┤  │
         │                │ attachments     │       │ id (PK)         │  │
         │                │ read_at         │       │ user_id (FK)    │◀─┘
         │                │ created_at      │       │ stripe_sub_id   │
         │                └─────────────────┘       │ status          │
         │                                          │ plan            │
         │                ┌─────────────────┐       │ current_period  │
         │                │     reviews     │       │ created_at      │
         │                ├─────────────────┤       └─────────────────┘
         │                │ id (PK)         │
         └────────────────│ reviewer_id(FK) │       ┌─────────────────┐
                          │ reviewee_id(FK) │       │   gig_usage     │
                          │ gig_id (FK)     │       ├─────────────────┤
                          │ rating          │       │ id (PK)         │
                          │ comment         │       │ user_id (FK)    │
                          │ created_at      │       │ month           │
                          └─────────────────┘       │ year            │
                                                    │ posts_count     │
                          ┌─────────────────┐       │ created_at      │
                          │  notifications  │       └─────────────────┘
                          ├─────────────────┤
                          │ id (PK)         │       ┌─────────────────┐
                          │ user_id (FK)    │       │  video_calls    │
                          │ type            │       ├─────────────────┤
                          │ title           │       │ id (PK)         │
                          │ body            │       │ room_id         │
                          │ data            │       │ initiator_id    │
                          │ read_at         │       │ participant_ids │
                          │ created_at      │       │ gig_id (FK)     │
                          └─────────────────┘       │ scheduled_at    │
                                                    │ started_at      │
                                                    │ ended_at        │
                                                    │ created_at      │
                                                    └─────────────────┘
```

## Table Definitions

### profiles
Extends Supabase auth.users with profile information.

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  skills TEXT[] DEFAULT '{}',
  ai_tools TEXT[] DEFAULT '{}',
  hourly_rate DECIMAL(10,2),
  portfolio_urls TEXT[] DEFAULT '{}',
  location TEXT,
  timezone TEXT,
  is_available BOOLEAN DEFAULT true,
  profile_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for username lookups
CREATE UNIQUE INDEX profiles_username_idx ON profiles(username);

-- RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);
```

### gigs
Job/gig postings.

```sql
CREATE TYPE gig_status AS ENUM ('draft', 'active', 'paused', 'closed', 'filled');
CREATE TYPE budget_type AS ENUM ('fixed', 'hourly');
CREATE TYPE location_type AS ENUM ('remote', 'onsite', 'hybrid');

CREATE TABLE gigs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poster_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  skills_required TEXT[] DEFAULT '{}',
  ai_tools_preferred TEXT[] DEFAULT '{}',
  budget_type budget_type NOT NULL,
  budget_min DECIMAL(10,2),
  budget_max DECIMAL(10,2),
  duration TEXT,
  location_type location_type DEFAULT 'remote',
  location TEXT,
  status gig_status DEFAULT 'active',
  applications_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX gigs_poster_id_idx ON gigs(poster_id);
CREATE INDEX gigs_status_idx ON gigs(status);
CREATE INDEX gigs_category_idx ON gigs(category);
CREATE INDEX gigs_created_at_idx ON gigs(created_at DESC);

-- Full-text search index
CREATE INDEX gigs_search_idx ON gigs
  USING GIN (to_tsvector('english', title || ' ' || description));

-- RLS Policies
ALTER TABLE gigs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active gigs are viewable by everyone"
  ON gigs FOR SELECT USING (status = 'active' OR poster_id = auth.uid());

CREATE POLICY "Users can insert own gigs"
  ON gigs FOR INSERT WITH CHECK (auth.uid() = poster_id);

CREATE POLICY "Users can update own gigs"
  ON gigs FOR UPDATE USING (auth.uid() = poster_id);

CREATE POLICY "Users can delete own gigs"
  ON gigs FOR DELETE USING (auth.uid() = poster_id);
```

### applications
Job applications submitted by users.

```sql
CREATE TYPE application_status AS ENUM (
  'pending', 'reviewing', 'shortlisted', 'rejected', 'accepted', 'withdrawn'
);

CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cover_letter TEXT NOT NULL,
  proposed_rate DECIMAL(10,2),
  proposed_timeline TEXT,
  portfolio_items TEXT[] DEFAULT '{}',
  ai_tools_to_use TEXT[] DEFAULT '{}',
  status application_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate applications
  UNIQUE(gig_id, applicant_id)
);

-- Indexes
CREATE INDEX applications_gig_id_idx ON applications(gig_id);
CREATE INDEX applications_applicant_id_idx ON applications(applicant_id);
CREATE INDEX applications_status_idx ON applications(status);

-- RLS Policies
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Applicants can view own applications"
  ON applications FOR SELECT
  USING (auth.uid() = applicant_id);

CREATE POLICY "Gig owners can view applications"
  ON applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM gigs WHERE gigs.id = applications.gig_id
      AND gigs.poster_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own applications"
  ON applications FOR INSERT
  WITH CHECK (auth.uid() = applicant_id);

CREATE POLICY "Applicants can update own applications"
  ON applications FOR UPDATE
  USING (auth.uid() = applicant_id);

CREATE POLICY "Gig owners can update application status"
  ON applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM gigs WHERE gigs.id = applications.gig_id
      AND gigs.poster_id = auth.uid()
    )
  );
```

### conversations
Chat conversations between users.

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_ids UUID[] NOT NULL,
  gig_id UUID REFERENCES gigs(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding user's conversations
CREATE INDEX conversations_participants_idx ON conversations USING GIN(participant_ids);

-- RLS Policies
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view their conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = ANY(participant_ids));

CREATE POLICY "Users can create conversations they're part of"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = ANY(participant_ids));
```

### messages
Individual messages within conversations.

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  read_by UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX messages_conversation_id_idx ON messages(conversation_id);
CREATE INDEX messages_created_at_idx ON messages(created_at DESC);

-- RLS Policies
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Conversation participants can view messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND auth.uid() = ANY(conversations.participant_ids)
    )
  );

CREATE POLICY "Participants can send messages"
  ON messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND auth.uid() = ANY(conversations.participant_ids)
    )
  );
```

### subscriptions
User subscription status for billing.

```sql
CREATE TYPE subscription_status AS ENUM (
  'active', 'canceled', 'past_due', 'trialing', 'incomplete'
);

CREATE TYPE subscription_plan AS ENUM ('free', 'pro');

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status subscription_status DEFAULT 'active',
  plan subscription_plan DEFAULT 'free',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

-- RLS Policies
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT USING (auth.uid() = user_id);
```

### gig_usage
Tracks monthly gig posting usage for free tier limits.

```sql
CREATE TABLE gig_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  posts_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, month, year)
);

-- RLS Policies
ALTER TABLE gig_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
  ON gig_usage FOR SELECT USING (auth.uid() = user_id);
```

### reviews
Reviews/ratings for completed gigs.

```sql
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One review per gig per reviewer-reviewee pair
  UNIQUE(gig_id, reviewer_id, reviewee_id)
);

-- Indexes
CREATE INDEX reviews_reviewee_id_idx ON reviews(reviewee_id);

-- RLS Policies
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews are publicly viewable"
  ON reviews FOR SELECT USING (true);

CREATE POLICY "Gig participants can create reviews"
  ON reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id);
```

### notifications
In-app notifications.

```sql
CREATE TYPE notification_type AS ENUM (
  'new_application', 'application_status', 'new_message',
  'call_scheduled', 'review_received', 'gig_update'
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data JSONB DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX notifications_user_id_idx ON notifications(user_id);
CREATE INDEX notifications_read_at_idx ON notifications(read_at);

-- RLS Policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE USING (auth.uid() = user_id);
```

### video_calls
Scheduled and completed video calls.

```sql
CREATE TABLE video_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL UNIQUE,
  initiator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  participant_ids UUID[] NOT NULL,
  gig_id UUID REFERENCES gigs(id) ON DELETE SET NULL,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE video_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view their calls"
  ON video_calls FOR SELECT
  USING (auth.uid() = ANY(participant_ids) OR auth.uid() = initiator_id);

CREATE POLICY "Users can create calls"
  ON video_calls FOR INSERT
  WITH CHECK (auth.uid() = initiator_id);
```

## Database Functions

### Auto-update timestamps

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_gigs_updated_at
  BEFORE UPDATE ON gigs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ... repeat for other tables
```

### Create profile on signup

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  -- Initialize free subscription
  INSERT INTO subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

### Increment application count

```sql
CREATE OR REPLACE FUNCTION increment_application_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE gigs
  SET applications_count = applications_count + 1
  WHERE id = NEW.gig_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_application_created
  AFTER INSERT ON applications
  FOR EACH ROW EXECUTE FUNCTION increment_application_count();
```

## Indexes Summary

| Table | Index | Purpose |
|-------|-------|---------|
| profiles | username | Fast username lookups |
| gigs | poster_id, status, category | Filtering and ownership |
| gigs | Full-text (title, description) | Search |
| applications | gig_id, applicant_id | Lookups by gig or user |
| messages | conversation_id, created_at | Chat history |
| notifications | user_id, read_at | User notifications |
