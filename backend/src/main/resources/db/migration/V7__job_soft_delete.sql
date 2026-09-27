-- =============================================================================
--  V7 -- recoverable delete for jobs ("trash")
-- =============================================================================
--  Before this, DELETE /api/jobs/5 removed the row. There was no undo, and the
--  admin screens are where an accidental delete is most likely: the delete
--  button sits one line below Edit in a dense 25-row work queue.
--
--  A job is now retired by stamping deleted_at instead. Every public read adds
--  "deleted_at IS NULL", so the posting disappears from the site immediately,
--  but the row (and its fee / age-relaxation children) survive and can be
--  restored. Permanent removal is a separate, explicit "empty trash" action.
--
--  Nullable with no default, deliberately: NULL means live, and that is what
--  every existing row already is, so no backfill is needed. A default of now()
--  would silently trash the entire table.
--
--  TIMESTAMP(6) WITH TIME ZONE, not plain TIMESTAMP -- Java's Instant maps to
--  the time-zone-aware type, and spring.jpa.hibernate.ddl-auto=validate refuses
--  to start the application on a mismatch. V1's header makes the same point.
--  This migration and the Job.deletedAt field must deploy together: either one
--  alone is a boot failure, not a runtime bug. Flyway runs before Hibernate's
--  validation, so a single deploy containing both is the correct shape.
-- =============================================================================

ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP(6) WITH TIME ZONE;

-- The trash screen: newest-deleted first. Partial because the overwhelming
-- majority of rows are live, and a live row has nothing to contribute to a
-- listing of deleted ones -- the same reasoning as idx_jobs_state in V2.
CREATE INDEX IF NOT EXISTS idx_jobs_deleted_at
    ON jobs (deleted_at DESC)
    WHERE deleted_at IS NOT NULL;

-- Every listing query now carries "deleted_at IS NULL", which makes the nine
-- full-table indexes from V2 and V3 second-best for it: Postgres can use them,
-- but still has to visit the heap to check deleted_at. These three partial
-- indexes cover the queries that actually run on every page view.
--
-- The V2/V3 indexes are left in place. They are still correct, they cost only
-- write time, and this site writes about a hundred rows a day -- dropping a
-- working index to save that is not a trade worth the risk.

-- The default listing order (JobService.LISTING_SORT): newest opening first,
-- with id as the tiebreaker that stops a row appearing on two pages at once.
CREATE INDEX IF NOT EXISTS idx_jobs_live_listing
    ON jobs (application_start_date DESC NULLS LAST, id DESC)
    WHERE deleted_at IS NULL;

-- The most common filtered shape: one category, default order. The homepage
-- fires six of these.
CREATE INDEX IF NOT EXISTS idx_jobs_live_category
    ON jobs (category, application_start_date DESC NULLS LAST, id DESC)
    WHERE deleted_at IS NULL;

-- "Closing soon" and the homepage ticker (JobService.CLOSING_SORT).
CREATE INDEX IF NOT EXISTS idx_jobs_live_last_date
    ON jobs (last_date ASC NULLS LAST, id ASC)
    WHERE deleted_at IS NULL;
