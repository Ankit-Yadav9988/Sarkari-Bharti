-- =============================================================================
--  V5 -- email alerts: unsubscribe tokens and a record of what was sent
-- =============================================================================
--  Until now the subscribe box only stored addresses; nothing could ever be
--  sent. Two things have to exist before a single alert goes out.
--
--  1. An unsubscribe token per subscriber. Not optional and not cosmetic: a
--     bulk message with no one-click way out gets marked as spam, and enough
--     spam marks poison the sending domain for every future message. The token
--     is a random UUID rather than the row id, because the id is guessable and
--     anyone could then unsubscribe anyone else by counting upwards.
--
--  2. A log of each broadcast. Without it there is no answer to "did that
--     actually send?" after the admin closes the tab, and a nervous admin
--     pressing send a second time mails everybody twice.
-- =============================================================================

ALTER TABLE subscribers
    ADD COLUMN IF NOT EXISTS unsubscribe_token VARCHAR(64);

-- Backfill before the NOT NULL: gen_random_uuid() ships with PostgreSQL 13+
-- (and Supabase), so no extension is needed.
UPDATE subscribers
   SET unsubscribe_token = REPLACE(gen_random_uuid()::text, '-', '')
 WHERE unsubscribe_token IS NULL;

ALTER TABLE subscribers
    ALTER COLUMN unsubscribe_token SET NOT NULL;

-- The unsubscribe endpoint looks a row up by this and nothing else, so it has
-- to be both unique and indexed.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uk_subscribers_unsubscribe_token'
    ) THEN
        ALTER TABLE subscribers
            ADD CONSTRAINT uk_subscribers_unsubscribe_token UNIQUE (unsubscribe_token);
    END IF;
END $$;


CREATE TABLE IF NOT EXISTS email_broadcasts (
    id             BIGSERIAL PRIMARY KEY,
    subject        VARCHAR(255)                NOT NULL,
    -- How many addresses were on the list when the send began. Recipients can
    -- unsubscribe mid-send, so this will not always equal sent + failed.
    recipient_count INTEGER                    NOT NULL,
    sent_count     INTEGER                     NOT NULL DEFAULT 0,
    failed_count   INTEGER                     NOT NULL DEFAULT 0,
    started_at     TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    finished_at    TIMESTAMP(6) WITH TIME ZONE,
    -- First failure only. The full list would be unbounded and the first one is
    -- almost always the reason for all of them (bad password, quota reached).
    error_message  VARCHAR(500)
);

CREATE INDEX IF NOT EXISTS idx_email_broadcasts_started
    ON email_broadcasts (started_at DESC);
