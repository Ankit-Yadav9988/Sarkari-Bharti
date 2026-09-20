-- Upcoming notices often publish before an application window is confirmed.
-- Keep the dates when known, but do not make them a prerequisite for publishing
-- a notice in the Upcoming section.
ALTER TABLE jobs
    ALTER COLUMN application_start_date DROP NOT NULL;

ALTER TABLE jobs
    ALTER COLUMN last_date DROP NOT NULL;
