-- 013: Web Playable Alpha — market hubs, NPC raiders, attack pursuit, supply
-- zones, onboarding persistence and city placement guarantees.
-- Idempotent: safe on a fresh database, on any 001-012 database, and on re-run.

-- Neutral market hub: exactly one per kingdom, seeded by the game server.
CREATE TABLE IF NOT EXISTS market_hubs (
  id UUID PRIMARY KEY,
  kingdom_id UUID NOT NULL,
  name TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS market_hubs_one_per_kingdom_uq ON market_hubs (kingdom_id);

-- Player onboarding progress (persisted, survives logout).
CREATE TABLE IF NOT EXISTS player_onboarding (
  player_id UUID PRIMARY KEY,
  variant TEXT NOT NULL DEFAULT 'web_alpha_v1',
  completed_steps JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NPC spawn bookkeeping per kingdom (raider respawn cadence, sequence).
CREATE TABLE IF NOT EXISTS npc_spawn_state (
  kingdom_id UUID PRIMARY KEY,
  spawn_sequence INTEGER NOT NULL DEFAULT 0,
  next_raider_spawn_at TIMESTAMPTZ
);

-- Army extensions for Alpha: NPC kind, attack pursuit order, supply clock.
ALTER TABLE armies ADD COLUMN IF NOT EXISTS npc_kind TEXT;
ALTER TABLE armies ADD COLUMN IF NOT EXISTS target_army_id UUID;
ALTER TABLE armies ADD COLUMN IF NOT EXISTS attack_order_id TEXT;
ALTER TABLE armies ADD COLUMN IF NOT EXISTS attack_seed BIGINT;
ALTER TABLE armies ADD COLUMN IF NOT EXISTS attack_issued_at TIMESTAMPTZ;
ALTER TABLE armies ADD COLUMN IF NOT EXISTS last_supply_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Raiders live outside the world-event lifecycle; relax the 007 npc constraint
-- (existing npc-rows keep passing: source_world_event_id IS NOT NULL).
ALTER TABLE armies DROP CONSTRAINT IF EXISTS armies_owner_type_check;
ALTER TABLE armies ADD CONSTRAINT armies_owner_type_check CHECK (
  (owner_type = 'player' AND player_id IS NOT NULL) OR
  (owner_type = 'npc' AND player_id IS NULL AND (source_world_event_id IS NOT NULL OR npc_kind = 'raider'))
);
ALTER TABLE armies DROP CONSTRAINT IF EXISTS armies_npc_kind_check;
ALTER TABLE armies ADD CONSTRAINT armies_npc_kind_check CHECK (
  npc_kind IS NULL OR (owner_type = 'npc' AND npc_kind IN ('raider', 'migration'))
);

-- Routes and caravans may target a market hub instead of a player city.
ALTER TABLE trade_routes ADD COLUMN IF NOT EXISTS destination_kind TEXT NOT NULL DEFAULT 'city';
ALTER TABLE trade_routes ADD COLUMN IF NOT EXISTS destination_market_id UUID;
ALTER TABLE trade_routes ALTER COLUMN destination_city_id DROP NOT NULL;

ALTER TABLE caravans ADD COLUMN IF NOT EXISTS destination_kind TEXT NOT NULL DEFAULT 'city';
ALTER TABLE caravans ADD COLUMN IF NOT EXISTS destination_market_id UUID;
ALTER TABLE caravans ALTER COLUMN destination_city_id DROP NOT NULL;

-- Backfill: pre-Alpha rows all target cities.
UPDATE trade_routes SET destination_kind = 'city' WHERE destination_kind IS NULL;
UPDATE caravans SET destination_kind = 'city' WHERE destination_kind IS NULL;

-- Exactly one destination: city xor market.
ALTER TABLE trade_routes DROP CONSTRAINT IF EXISTS trade_routes_destination_check;
ALTER TABLE trade_routes ADD CONSTRAINT trade_routes_destination_check CHECK (
  (destination_kind = 'city' AND destination_city_id IS NOT NULL AND destination_market_id IS NULL) OR
  (destination_kind = 'market' AND destination_city_id IS NULL AND destination_market_id IS NOT NULL)
);
ALTER TABLE caravans DROP CONSTRAINT IF EXISTS caravans_destination_check;
ALTER TABLE caravans ADD CONSTRAINT caravans_destination_check CHECK (
  (destination_kind = 'city' AND destination_city_id IS NOT NULL AND destination_market_id IS NULL) OR
  (destination_kind = 'market' AND destination_city_id IS NULL AND destination_market_id IS NOT NULL)
);

-- City placement guarantee: at most one city per tile per kingdom.
CREATE UNIQUE INDEX IF NOT EXISTS cities_kingdom_position_uq ON cities (kingdom_id, x, y);

-- Lookups for pursuit resolution and NPC bookkeeping.
CREATE INDEX IF NOT EXISTS idx_armies_target ON armies (target_army_id) WHERE target_army_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_armies_npc_kind ON armies (npc_kind) WHERE npc_kind IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_armies_attack_issued ON armies (attack_issued_at) WHERE attack_order_id IS NOT NULL;