-- =============================================================================
-- ADMIN TABLES FOR COMMISSIONER ADMIN PANEL
-- =============================================================================
-- These tables support manual overrides and admin functionality
-- Run this SQL in your Supabase SQL Editor to create the tables
-- =============================================================================

-- =============================================================================
-- 1. ADMIN ADJUSTMENTS TABLE - Tracks all manual prize money adjustments
-- =============================================================================
CREATE TABLE IF NOT EXISTS admin_adjustments (
    id BIGSERIAL PRIMARY KEY,

    -- User being adjusted
    user_id UUID NOT NULL REFERENCES auth.users(id),
    username TEXT NOT NULL,

    -- Adjustment details
    amount DECIMAL(12, 2) NOT NULL,          -- Positive = add, Negative = subtract
    reason TEXT,                              -- Optional note explaining adjustment

    -- Event context (optional)
    event_id TEXT,
    event_name TEXT,

    -- Admin who made the change
    admin_user_id UUID NOT NULL REFERENCES auth.users(id),
    admin_email TEXT NOT NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Index for fast user lookups
    CONSTRAINT admin_adjustments_user_id_idx UNIQUE (id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_adjustments_user_id ON admin_adjustments(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_adjustments_created_at ON admin_adjustments(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_adjustments_admin_user_id ON admin_adjustments(admin_user_id);

-- Enable RLS
ALTER TABLE admin_adjustments ENABLE ROW LEVEL SECURITY;

-- Policy: Only admin can read adjustments
CREATE POLICY "Allow admin read on admin_adjustments"
    ON admin_adjustments
    FOR SELECT
    TO authenticated
    USING (
        auth.jwt() ->> 'email' = 'dangajewski99@gmail.com'
        OR user_id = auth.uid()  -- Users can see their own adjustments
    );

-- Policy: Only admin can insert adjustments
CREATE POLICY "Allow admin insert on admin_adjustments"
    ON admin_adjustments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.jwt() ->> 'email' = 'dangajewski99@gmail.com'
    );

-- =============================================================================
-- 2. MANUAL FIELDS TABLE - Stores manually entered player fields
-- =============================================================================
CREATE TABLE IF NOT EXISTS manual_fields (
    id BIGSERIAL PRIMARY KEY,

    -- Event identification
    event_id TEXT NOT NULL,
    event_name TEXT NOT NULL,

    -- Player data
    player_name TEXT NOT NULL,
    player_country TEXT,

    -- Generated ID for draft compatibility
    player_id TEXT NOT NULL,                 -- Format: "manual_{timestamp}_{index}"

    -- Admin who added
    added_by_user_id UUID NOT NULL REFERENCES auth.users(id),
    added_by_email TEXT NOT NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint to prevent duplicate players per event
    CONSTRAINT unique_manual_player_per_event UNIQUE (event_id, player_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_manual_fields_event_id ON manual_fields(event_id);
CREATE INDEX IF NOT EXISTS idx_manual_fields_player_name ON manual_fields(player_name);

-- Enable RLS
ALTER TABLE manual_fields ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read manual fields (needed for draft)
CREATE POLICY "Allow public read on manual_fields"
    ON manual_fields
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Only admin can insert manual fields
CREATE POLICY "Allow admin insert on manual_fields"
    ON manual_fields
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.jwt() ->> 'email' = 'dangajewski99@gmail.com'
    );

-- Policy: Only admin can delete manual fields
CREATE POLICY "Allow admin delete on manual_fields"
    ON manual_fields
    FOR DELETE
    TO authenticated
    USING (
        auth.jwt() ->> 'email' = 'dangajewski99@gmail.com'
    );

-- =============================================================================
-- 3. ADMIN ACTION LOG TABLE - Audit trail of all admin actions
-- =============================================================================
CREATE TABLE IF NOT EXISTS admin_action_log (
    id BIGSERIAL PRIMARY KEY,

    -- Action details
    action_type TEXT NOT NULL,               -- 'draft_pick', 'prize_adjustment', 'field_load', etc.
    action_description TEXT NOT NULL,

    -- Target of action
    target_user_id UUID,
    target_username TEXT,

    -- Additional data (JSON for flexibility)
    action_data JSONB,

    -- Admin who performed action
    admin_user_id UUID NOT NULL REFERENCES auth.users(id),
    admin_email TEXT NOT NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_action_log_action_type ON admin_action_log(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_created_at ON admin_action_log(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_admin_user_id ON admin_action_log(admin_user_id);

-- Enable RLS
ALTER TABLE admin_action_log ENABLE ROW LEVEL SECURITY;

-- Policy: Only admin can read/write action log
CREATE POLICY "Allow admin full access on admin_action_log"
    ON admin_action_log
    FOR ALL
    TO authenticated
    USING (
        auth.jwt() ->> 'email' = 'dangajewski99@gmail.com'
    )
    WITH CHECK (
        auth.jwt() ->> 'email' = 'dangajewski99@gmail.com'
    );

-- =============================================================================
-- 4. UPDATE SEASON_STANDINGS TO SUPPORT MANUAL ADJUSTMENTS
-- =============================================================================
-- Add column for manual adjustments (run only if column doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'season_standings'
        AND column_name = 'manual_adjustment'
    ) THEN
        ALTER TABLE season_standings ADD COLUMN manual_adjustment DECIMAL(12, 2) DEFAULT 0;
    END IF;
END $$;

-- =============================================================================
-- 5. HELPER FUNCTION: Calculate total winnings including adjustments
-- =============================================================================
CREATE OR REPLACE FUNCTION get_adjusted_winnings(p_user_id UUID)
RETURNS DECIMAL AS $$
DECLARE
    base_winnings DECIMAL;
    adjustment_total DECIMAL;
BEGIN
    -- Get base winnings from season_standings
    SELECT COALESCE(total_winnings, 0) INTO base_winnings
    FROM season_standings
    WHERE user_id = p_user_id;

    -- Get sum of all adjustments
    SELECT COALESCE(SUM(amount), 0) INTO adjustment_total
    FROM admin_adjustments
    WHERE user_id = p_user_id;

    RETURN COALESCE(base_winnings, 0) + adjustment_total;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 6. VIEW: Season standings with adjustments included
-- =============================================================================
CREATE OR REPLACE VIEW season_standings_with_adjustments AS
SELECT
    ss.*,
    COALESCE(aa.total_adjustments, 0) as total_adjustments,
    ss.total_winnings + COALESCE(aa.total_adjustments, 0) as adjusted_total_winnings
FROM season_standings ss
LEFT JOIN (
    SELECT user_id, SUM(amount) as total_adjustments
    FROM admin_adjustments
    GROUP BY user_id
) aa ON ss.user_id = aa.user_id;

-- =============================================================================
-- USAGE NOTES
-- =============================================================================
--
-- Admin is identified by email: dangajewski99@gmail.com
--
-- The admin can:
-- 1. View/create admin_adjustments to modify prize money
-- 2. Add players to manual_fields for tournament fields
-- 3. All actions are logged in admin_action_log for auditing
--
-- To view all admin actions:
--   SELECT * FROM admin_action_log ORDER BY created_at DESC;
--
-- To view prize adjustments for a user:
--   SELECT * FROM admin_adjustments WHERE user_id = 'xxx' ORDER BY created_at DESC;
--
-- To see standings with adjustments:
--   SELECT * FROM season_standings_with_adjustments ORDER BY adjusted_total_winnings DESC;
--
-- =============================================================================
