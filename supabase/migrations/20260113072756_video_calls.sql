-- =============================================
-- VIDEO CALLS TABLE (Jitsi Integration)
-- =============================================

CREATE TABLE IF NOT EXISTS video_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id TEXT NOT NULL UNIQUE,
    initiator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    participant_ids UUID[] NOT NULL,
    gig_id UUID REFERENCES gigs(id) ON DELETE SET NULL,
    application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_video_calls_initiator_id ON video_calls(initiator_id);
CREATE INDEX IF NOT EXISTS idx_video_calls_gig_id ON video_calls(gig_id);
CREATE INDEX IF NOT EXISTS idx_video_calls_application_id ON video_calls(application_id);
CREATE INDEX IF NOT EXISTS idx_video_calls_scheduled_at ON video_calls(scheduled_at);

-- RLS policies
ALTER TABLE video_calls ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own video calls" ON video_calls;
DROP POLICY IF EXISTS "Users can create video calls" ON video_calls;
DROP POLICY IF EXISTS "Initiator can update video calls" ON video_calls;
DROP POLICY IF EXISTS "Participants can update call status" ON video_calls;

-- Users can view calls they're part of
CREATE POLICY "Users can view own video calls"
    ON video_calls FOR SELECT
    USING (
        auth.uid() = initiator_id OR
        auth.uid() = ANY(participant_ids)
    );

-- Users can create video calls
CREATE POLICY "Users can create video calls"
    ON video_calls FOR INSERT
    WITH CHECK (auth.uid() = initiator_id);

-- Initiator can update video calls
CREATE POLICY "Initiator can update video calls"
    ON video_calls FOR UPDATE
    USING (auth.uid() = initiator_id);

-- Participants can update started_at/ended_at (for joining/leaving)
CREATE POLICY "Participants can update call status"
    ON video_calls FOR UPDATE
    USING (auth.uid() = ANY(participant_ids));
