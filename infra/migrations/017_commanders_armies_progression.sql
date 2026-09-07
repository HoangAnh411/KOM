-- Additive v2 storage. game_state remains the canonical snapshot; these columns/tables
-- make the new aggregates queryable and give persistence workers stable boundaries.
ALTER TABLE armies ADD COLUMN IF NOT EXISTS commander_id TEXT;
ALTER TABLE armies ADD COLUMN IF NOT EXISTS composition JSONB;
ALTER TABLE armies ADD COLUMN IF NOT EXISTS stance TEXT;
ALTER TABLE armies ADD COLUMN IF NOT EXISTS home_city_id UUID;
ALTER TABLE armies ADD COLUMN IF NOT EXISTS wounded JSONB NOT NULL DEFAULT '{}';
ALTER TABLE armies ADD COLUMN IF NOT EXISTS recovery_at TIMESTAMPTZ;
ALTER TABLE armies ADD COLUMN IF NOT EXISTS returning_home BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS armies_commander_idx ON armies(commander_id) WHERE commander_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS commanders (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 10),
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  assigned_army_id UUID,
  neutral BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS commanders_assigned_army_idx ON commanders(assigned_army_id) WHERE assigned_army_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS troop_reserves (
  city_id UUID PRIMARY KEY,
  player_id UUID NOT NULL,
  available JSONB NOT NULL DEFAULT '{}',
  wounded JSONB NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS training_queue_v2 (
  id TEXT PRIMARY KEY,
  city_id UUID NOT NULL,
  troop_type TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  started_at TIMESTAMPTZ NOT NULL,
  completes_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS hospital_queue_v2 (
  id TEXT PRIMARY KEY,
  city_id UUID NOT NULL,
  troop_type TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  food_cost INTEGER NOT NULL CHECK (food_cost >= 0),
  started_at TIMESTAMPTZ NOT NULL,
  completes_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS formation_presets_v2 (
  id TEXT PRIMARY KEY,
  player_id UUID NOT NULL,
  name TEXT NOT NULL,
  composition JSONB NOT NULL,
  stance TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS research_queue_v2 (
  id TEXT PRIMARY KEY,
  player_id UUID NOT NULL,
  technology_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completes_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS campaign_progress_v2 (
  player_id UUID PRIMARY KEY,
  completed_mission_ids JSONB NOT NULL DEFAULT '[]',
  claimed_first_clear_ids JSONB NOT NULL DEFAULT '[]',
  unlocked_chapter INTEGER NOT NULL DEFAULT 1 CHECK (unlocked_chapter BETWEEN 1 AND 3)
);
