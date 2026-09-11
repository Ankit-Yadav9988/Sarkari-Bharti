-- =============================================================================
--  V4 -- new content types: cut-offs, exam calendar, previous-year papers
-- =============================================================================
--  These three are consistently among the highest-traffic pages on portals in
--  this category, and unlike a notification they are evergreen -- a 2023 cut-off
--  keeps earning search traffic for years, where a closed application does not.
--
--  All three keep the same shape as notices/syllabi: an optional job_id back
--  reference rather than a hard foreign key, because the admin routinely posts
--  a cut-off for an exam that was never listed as a job here.
-- =============================================================================

CREATE TABLE IF NOT EXISTS cutoffs (
    id            BIGSERIAL PRIMARY KEY,
    title         VARCHAR(255) NOT NULL,   -- "SSC CGL 2025 Tier-1 Cut Off"
    exam_name     VARCHAR(255),            -- "SSC CGL"
    organization  VARCHAR(255),
    category      VARCHAR(255),
    exam_year     INTEGER,                 -- filter and sort key: cut-offs are compared year over year
    state         VARCHAR(255),
    link          VARCHAR(255),            -- official PDF, optional: marks may be typed in below instead
    -- Category-wise marks as free text ("GEN 148.2 / OBC 142.6 / SC 129.4").
    -- Deliberately not a structured table: the categories differ by exam and by
    -- year, and a rigid schema here would block posting rather than help.
    marks_summary TEXT,
    published_date DATE,
    job_id        BIGINT,
    note          TEXT
);

CREATE INDEX IF NOT EXISTS idx_cutoffs_exam_year ON cutoffs (exam_year DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_cutoffs_category ON cutoffs (category);
CREATE INDEX IF NOT EXISTS idx_cutoffs_published_date
    ON cutoffs (published_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_cutoffs_job_id ON cutoffs (job_id) WHERE job_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS exam_calendar (
    id             BIGSERIAL PRIMARY KEY,
    exam_name      VARCHAR(255) NOT NULL,  -- "UPSC Civil Services Prelims"
    organization   VARCHAR(255),
    category       VARCHAR(255),
    -- The whole point of this page is the timeline, so these three are the
    -- payload rather than metadata.
    notification_date DATE,
    application_window_end DATE,
    exam_date      DATE,
    exam_year      INTEGER,
    tentative      BOOLEAN DEFAULT FALSE NOT NULL,  -- official calendars publish "tentative" dates constantly
    link           VARCHAR(255),
    job_id         BIGINT,
    note           TEXT
);

-- The calendar page is always "what is coming up", ordered by exam date.
CREATE INDEX IF NOT EXISTS idx_exam_calendar_exam_date
    ON exam_calendar (exam_date NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_exam_calendar_category ON exam_calendar (category);
CREATE INDEX IF NOT EXISTS idx_exam_calendar_exam_year ON exam_calendar (exam_year);

CREATE TABLE IF NOT EXISTS previous_year_papers (
    id           BIGSERIAL PRIMARY KEY,
    title        VARCHAR(255) NOT NULL,    -- "SSC CGL 2024 Tier-1 Question Paper (Shift 2)"
    exam_name    VARCHAR(255),
    organization VARCHAR(255),
    category     VARCHAR(255),
    exam_year    INTEGER,
    paper_stage  VARCHAR(255),             -- "Tier 1", "Prelims", "Mains"
    language     VARCHAR(255),             -- "English", "Hindi", "Bilingual"
    link         VARCHAR(255) NOT NULL,    -- the paper PDF; a row without one is useless
    answer_key_link VARCHAR(255),
    has_solution BOOLEAN DEFAULT FALSE NOT NULL,
    job_id       BIGINT,
    note         TEXT
);

CREATE INDEX IF NOT EXISTS idx_papers_exam_year ON previous_year_papers (exam_year DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_papers_category ON previous_year_papers (category);
CREATE INDEX IF NOT EXISTS idx_papers_exam_name_lower
    ON previous_year_papers (lower(exam_name));
CREATE INDEX IF NOT EXISTS idx_papers_job_id
    ON previous_year_papers (job_id) WHERE job_id IS NOT NULL;
