-- Tiny partial index for the admin dashboard's Lights Out views tile.
-- user_activity_log has 5M+ rows; without this, the stats query read 235k
-- rows per dashboard load (760ms, and enough load to trip D1 rate limits).
-- The endpoint forces it with INDEXED BY because the planner will not pick
-- a partial index on its own for a LIKE filter.
-- Applied to the remote uht-db by hand on 2026-11-17.
CREATE INDEX IF NOT EXISTS idx_activity_lightsout
  ON user_activity_log(created_at, session_id)
  WHERE activity_type = 'page_view' AND page_path LIKE '/lights-out%';
