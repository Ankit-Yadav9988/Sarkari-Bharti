-- =============================================================================
--  V2 -- indexes for the listing queries
-- =============================================================================
--  V1 is skipped on a database that already had tables, so anything that must
--  reach an existing deployment belongs here or later, not in V1.
--
--  Every index below backs a query the site actually issues. The homepage alone
--  fires six listing queries, and before this each one was a sequential scan of
--  the whole jobs table.
-- =============================================================================

-- /jobs?category=SSC and the /ssc-jobs style landing pages.
CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs (category);

-- /jobs?state=Uttar+Pradesh and the per-state landing pages. Partial: a null
-- state means central/all-India, and there is no query that looks for those by
-- state, so they are dead weight in the index.
CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs (state) WHERE state IS NOT NULL;

-- Drives "closing soon", the ticker, and the active/closed split.
CREATE INDEX IF NOT EXISTS idx_jobs_last_date ON jobs (last_date);

-- Default ordering on every listing page: newest posting first.
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs (created_at DESC NULLS LAST);

-- The upcoming-jobs page filters on this before the dates are consulted.
CREATE INDEX IF NOT EXISTS idx_jobs_listing_section ON jobs (listing_section);

-- Upcoming vs open is decided by the start date.
CREATE INDEX IF NOT EXISTS idx_jobs_application_start_date ON jobs (application_start_date);

-- Composite for the most common shape: one category, newest first. Postgres can
-- satisfy both the filter and the sort from this alone.
CREATE INDEX IF NOT EXISTS idx_jobs_category_created_at
    ON jobs (category, created_at DESC NULLS LAST);

-- Free-text search over the two fields the search box looks at. pg_trgm would
-- be better but needs an extension the hosting plan may not allow, so this
-- stays a plain lower() expression index, which still serves prefix matching.
CREATE INDEX IF NOT EXISTS idx_jobs_post_name_lower ON jobs (lower(post_name));
CREATE INDEX IF NOT EXISTS idx_jobs_organization_lower ON jobs (lower(organization));

-- Admit cards / results / answer keys are always fetched by type, newest first.
CREATE INDEX IF NOT EXISTS idx_notices_type_release_date
    ON notices (type, release_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_notices_job_id ON notices (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notices_category ON notices (category);

CREATE INDEX IF NOT EXISTS idx_syllabi_updated_date
    ON syllabi (updated_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_syllabi_job_id ON syllabi (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_syllabi_category ON syllabi (category);

-- The admin subscriber list is ordered by signup date.
CREATE INDEX IF NOT EXISTS idx_subscribers_created_at ON subscribers (created_at DESC);
