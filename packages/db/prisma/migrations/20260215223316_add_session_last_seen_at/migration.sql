-- This migration originally attempted to add Session.lastSeenAt, but the
-- authoritative Session definition in 20260215202040_add_sessions already
-- introduced the column with the correct default. Re-running the original
-- statement caused clean deploys to fail with “column already exists”.
--
-- To keep the migration chain deployable and preserve history, this migration
-- has been intentionally neutralized.

-- No operations performed (duplicate column addition neutralized)
