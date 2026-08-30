CREATE TABLE IF NOT EXISTS event_ledger (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  command_id TEXT,
  actor_player_id UUID,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS event_ledger_command_idx ON event_ledger (command_id) WHERE command_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS event_ledger_aggregate_idx ON event_ledger (aggregate_type, aggregate_id, created_at);


CREATE TABLE IF NOT EXISTS caravan_cargo (
  caravan_id UUID NOT NULL REFERENCES caravans(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('wood', 'stone', 'iron', 'food')),
  amount BIGINT NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (caravan_id, resource_type)
);

ALTER TABLE caravans DROP COLUMN IF EXISTS cargo;
