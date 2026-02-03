-- =============================================================================
-- SCRAPED FIELDS TABLE FOR PGA TOUR FIELD DATA
-- =============================================================================
-- This table stores tournament field data scraped from PGA Tour website
-- before tournaments start (Mon-Wed). Once tournament starts (Thursday),
-- the app switches to LiveGolf API data.
-- =============================================================================

-- Create the scraped_fields table
CREATE TABLE IF NOT EXISTS scraped_fields (
    id BIGSERIAL PRIMARY KEY,

    -- Event identification
    event_id TEXT NOT NULL,                    -- Matches LiveGolf event ID when available
    event_name TEXT NOT NULL,                  -- Tournament name (e.g., "The Sentry")
    event_slug TEXT,                           -- PGA Tour URL slug (e.g., "the-sentry")
    event_year INTEGER NOT NULL,               -- Tournament year (e.g., 2026)

    -- Player data
    player_name TEXT NOT NULL,                 -- Full player name
    player_country TEXT,                       -- Player's country/nationality
    player_pga_id TEXT,                        -- PGA Tour player ID if available
    player_livegolf_id TEXT,                   -- LiveGolf API player ID (for merging)

    -- Metadata
    scraped_at TIMESTAMPTZ DEFAULT NOW(),      -- When this record was scraped
    source_url TEXT,                           -- The URL that was scraped

    -- Unique constraint to prevent duplicate player entries per event
    CONSTRAINT unique_player_per_event UNIQUE (event_id, player_name)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_scraped_fields_event_id ON scraped_fields(event_id);
CREATE INDEX IF NOT EXISTS idx_scraped_fields_event_name ON scraped_fields(event_name);
CREATE INDEX IF NOT EXISTS idx_scraped_fields_scraped_at ON scraped_fields(scraped_at);
CREATE INDEX IF NOT EXISTS idx_scraped_fields_player_name ON scraped_fields(player_name);

-- Enable Row Level Security (RLS)
ALTER TABLE scraped_fields ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to read scraped fields (public tournament data)
CREATE POLICY "Allow public read access on scraped_fields"
    ON scraped_fields
    FOR SELECT
    TO public
    USING (true);

-- Policy: Only allow authenticated users to insert (for API security)
CREATE POLICY "Allow authenticated insert on scraped_fields"
    ON scraped_fields
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Policy: Only service role can update/delete (for admin cleanup)
CREATE POLICY "Allow service role full access on scraped_fields"
    ON scraped_fields
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- HELPER VIEWS
-- =============================================================================

-- View: Get the latest scraped field for each event
CREATE OR REPLACE VIEW latest_scraped_fields AS
SELECT DISTINCT ON (event_id, player_name)
    *
FROM scraped_fields
ORDER BY event_id, player_name, scraped_at DESC;

-- =============================================================================
-- CLEANUP FUNCTION (Optional - run periodically)
-- =============================================================================

-- Function to clean up old scraped data (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_scraped_fields()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM scraped_fields
    WHERE scraped_at < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SCRAPE LOG TABLE (Optional - for tracking scrape history)
-- =============================================================================

CREATE TABLE IF NOT EXISTS scrape_logs (
    id BIGSERIAL PRIMARY KEY,
    event_name TEXT NOT NULL,
    event_slug TEXT,
    players_found INTEGER DEFAULT 0,
    status TEXT NOT NULL,                      -- 'success', 'failed', 'partial'
    error_message TEXT,
    scraped_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for log lookups
CREATE INDEX IF NOT EXISTS idx_scrape_logs_scraped_at ON scrape_logs(scraped_at);

-- Policy for scrape_logs
ALTER TABLE scrape_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on scrape_logs"
    ON scrape_logs
    FOR SELECT
    TO public
    USING (true);

CREATE POLICY "Allow authenticated insert on scrape_logs"
    ON scrape_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- =============================================================================
-- USAGE NOTES
-- =============================================================================
--
-- 1. Run this SQL in your Supabase SQL Editor to create the tables
--
-- 2. The scraped_fields table stores:
--    - Player names and countries from PGA Tour website
--    - Event identifiers for matching with LiveGolf API
--    - Timestamp tracking for freshness
--
-- 3. The app logic should:
--    - Before tournament (Mon-Wed): Query scraped_fields
--    - During tournament (Thu-Sun): Use LiveGolf API
--    - Merge player IDs when LiveGolf data becomes available
--
-- 4. Manual cleanup can be done with:
--    SELECT cleanup_old_scraped_fields();
--
-- =============================================================================
