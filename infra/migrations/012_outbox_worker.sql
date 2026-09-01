-- Phase 7A outbox reliability: retry, claim and dead-letter state for the Redis Streams publisher.
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox_events (next_attempt_at) WHERE published_at IS NULL AND dead_lettered_at IS NULL;
CREATE INDEX IF NOT EXISTS outbox_dlq_idx ON outbox_events (dead_lettered_at) WHERE dead_lettered_at IS NOT NULL;