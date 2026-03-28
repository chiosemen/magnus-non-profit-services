-- This migration originally attempted to add Session.orgId + FK, but the
-- authoritative Session definition in 20260215202040_add_sessions already
-- provides the column and constraint. The duplicate DDL broke clean deploys.
--
-- To maintain migration ordering without breaking deploy, the operations are
-- now a documented no-op.

-- No operations performed (duplicate column + FK neutralized)
