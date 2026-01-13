-- Work History Table
-- Stores employment/work history for user profiles

CREATE TABLE IF NOT EXISTS work_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    company VARCHAR(200) NOT NULL,
    position VARCHAR(200) NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE,
    is_current BOOLEAN DEFAULT FALSE,
    location VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_work_history_user_id ON work_history(user_id);

-- Index for ordering by date
CREATE INDEX IF NOT EXISTS idx_work_history_dates ON work_history(user_id, start_date DESC);

-- RLS Policies
ALTER TABLE work_history ENABLE ROW LEVEL SECURITY;

-- Anyone can view work history (it's part of public profile)
CREATE POLICY "Work history is viewable by everyone"
    ON work_history FOR SELECT
    USING (true);

-- Users can insert their own work history
CREATE POLICY "Users can insert own work history"
    ON work_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own work history
CREATE POLICY "Users can update own work history"
    ON work_history FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own work history
CREATE POLICY "Users can delete own work history"
    ON work_history FOR DELETE
    USING (auth.uid() = user_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_work_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_work_history_updated_at
    BEFORE UPDATE ON work_history
    FOR EACH ROW
    EXECUTE FUNCTION update_work_history_updated_at();
