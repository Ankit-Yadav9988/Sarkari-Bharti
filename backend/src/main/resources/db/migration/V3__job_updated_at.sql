-- =============================================================================
--  V3 -- "last updated" timestamp on jobs
-- =============================================================================
--  Users on this kind of site have no way to tell a live listing from one that
--  has been stale for six months, and every competitor dates its content. This
--  column is what the frontend prints as "Updated 3 Sep 2026".
--
--  Backfilled from created_at so existing rows show a real date rather than a
--  blank, then defaulted so a row can never be written without one.
-- =============================================================================

ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP(6) WITH TIME ZONE;

UPDATE jobs SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL;

-- Ordering by "recently touched" is a distinct listing from "recently posted":
-- a job whose result date was just filled in should resurface.
CREATE INDEX IF NOT EXISTS idx_jobs_updated_at ON jobs (updated_at DESC NULLS LAST);
