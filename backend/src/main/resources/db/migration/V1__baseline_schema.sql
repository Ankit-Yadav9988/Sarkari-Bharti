-- =============================================================================
--  V1 -- baseline schema
-- =============================================================================
--  Reproduces exactly what ddl-auto=update had been creating, so that
--  ddl-auto=validate agrees with it and Flyway can take over ownership of the
--  schema from here on.
--
--  Every statement is IF NOT EXISTS. On a database that already has these
--  tables Flyway baselines at version 1 and skips this file entirely, but
--  writing it idempotently means running it anyway cannot break anything.
--
--  Column types are the ones Hibernate 6.4 generates for these entities on
--  PostgreSQL. Notably: Instant maps to TIMESTAMP WITH TIME ZONE, not plain
--  TIMESTAMP -- getting that wrong is what makes validate fail at boot.
-- =============================================================================

CREATE TABLE IF NOT EXISTS jobs (
    id                     BIGSERIAL PRIMARY KEY,
    post_name              VARCHAR(255)             NOT NULL,
    organization           VARCHAR(255)             NOT NULL,
    advertisement_no       VARCHAR(255),
    state                  VARCHAR(255),
    category               VARCHAR(255)             NOT NULL,
    listing_section        VARCHAR(255),
    total_posts            INTEGER,
    application_start_date DATE                     NOT NULL,
    last_date              DATE                     NOT NULL,
    admit_card_date        DATE,
    exam_date              DATE,
    result_date            DATE,
    age_min                INTEGER,
    age_max                INTEGER,
    eligibility            TEXT,
    selection_process      TEXT,
    official_apply_link    VARCHAR(255),
    notification_pdf_url   VARCHAR(255),
    syllabus_link          VARCHAR(255),
    created_at             TIMESTAMP(6) WITH TIME ZONE,
    views                  BIGINT
);

-- @ElementCollection Map<String, Double> feeByCategory
CREATE TABLE IF NOT EXISTS job_fees (
    job_id        BIGINT       NOT NULL,
    category_name VARCHAR(255) NOT NULL,
    amount        DOUBLE PRECISION,
    PRIMARY KEY (job_id, category_name)
);

-- @ElementCollection Map<String, Integer> ageRelaxationByCategory
CREATE TABLE IF NOT EXISTS job_age_relaxation (
    job_id        BIGINT       NOT NULL,
    category_name VARCHAR(255) NOT NULL,
    extra_years   INTEGER,
    PRIMARY KEY (job_id, category_name)
);

CREATE TABLE IF NOT EXISTS notices (
    id           BIGSERIAL PRIMARY KEY,
    type         VARCHAR(255) NOT NULL,
    title        VARCHAR(255) NOT NULL,
    organization VARCHAR(255),
    category     VARCHAR(255),
    link         VARCHAR(255) NOT NULL,
    release_date DATE,
    -- Deliberately not a foreign key: a result can be posted for an exam that
    -- was never listed as a job here, and the entity models this as a plain
    -- Long rather than a @ManyToOne.
    job_id       BIGINT,
    note         TEXT
);

CREATE TABLE IF NOT EXISTS syllabi (
    id           BIGSERIAL PRIMARY KEY,
    title        VARCHAR(255) NOT NULL,
    exam_name    VARCHAR(255),
    organization VARCHAR(255),
    category     VARCHAR(255),
    link         VARCHAR(255) NOT NULL,
    updated_date DATE,
    job_id       BIGINT,
    note         TEXT
);

CREATE TABLE IF NOT EXISTS subscribers (
    id         BIGSERIAL PRIMARY KEY,
    email      VARCHAR(255)             NOT NULL,
    interest   VARCHAR(255),
    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL
);

-- Matches @UniqueConstraint(columnNames = "email") on the Subscriber entity.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uk_subscribers_email'
    ) THEN
        ALTER TABLE subscribers ADD CONSTRAINT uk_subscribers_email UNIQUE (email);
    END IF;
END $$;

-- The element-collection tables are meaningless without their parent row, so
-- these cascades are what stop a deleted job leaving orphaned fee rows behind.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_job_fees_job'
    ) THEN
        ALTER TABLE job_fees
            ADD CONSTRAINT fk_job_fees_job
            FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_job_age_relaxation_job'
    ) THEN
        ALTER TABLE job_age_relaxation
            ADD CONSTRAINT fk_job_age_relaxation_job
            FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE;
    END IF;
END $$;
