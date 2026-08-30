-- Terrain per tile
ALTER TABLE map_tiles ADD COLUMN IF NOT EXISTS terrain_type TEXT NOT NULL DEFAULT 'plains';

-- Expand armies table for combat fields
ALTER TABLE armies ADD COLUMN IF NOT EXISTS unit_type TEXT NOT NULL DEFAULT 'infantry';
ALTER TABLE armies ADD COLUMN IF NOT EXISTS strength INTEGER NOT NULL DEFAULT 100;
ALTER TABLE armies ADD COLUMN IF NOT EXISTS morale INTEGER NOT NULL DEFAULT 100;
ALTER TABLE armies ADD COLUMN IF NOT EXISTS formation TEXT NOT NULL DEFAULT 'line';
ALTER TABLE armies ADD COLUMN IF NOT EXISTS target_x INTEGER;
ALTER TABLE armies ADD COLUMN IF NOT EXISTS target_y INTEGER;
ALTER TABLE armies ADD COLUMN IF NOT EXISTS owner_player_id UUID;
ALTER TABLE armies ADD COLUMN IF NOT EXISTS kingdom_id UUID;

-- Battle reports (immutable after creation)
ALTER TABLE battle_reports ADD COLUMN IF NOT EXISTS season_id UUID;
ALTER TABLE battle_reports ADD COLUMN IF NOT EXISTS tile_x INTEGER;
ALTER TABLE battle_reports ADD COLUMN IF NOT EXISTS tile_y INTEGER;
ALTER TABLE battle_reports ADD COLUMN IF NOT EXISTS terrain TEXT;
ALTER TABLE battle_reports ADD COLUMN IF NOT EXISTS attacker_army_id UUID;
ALTER TABLE battle_reports ADD COLUMN IF NOT EXISTS defender_army_id UUID;
ALTER TABLE battle_reports ADD COLUMN IF NOT EXISTS victor TEXT;
ALTER TABLE battle_reports ADD COLUMN IF NOT EXISTS seed INTEGER;
ALTER TABLE battle_reports ADD COLUMN IF NOT EXISTS rounds JSONB;

-- Military throughput per player per season
CREATE TABLE IF NOT EXISTS military_throughput (
  season_id UUID NOT NULL,
  player_id UUID NOT NULL,
  victories INTEGER NOT NULL DEFAULT 0,
  defeats INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  strength_destroyed INTEGER NOT NULL DEFAULT 0,
  strength_lost INTEGER NOT NULL DEFAULT 0,
  tiles_controlled INTEGER NOT NULL DEFAULT 0,
  successful_defenses INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (season_id, player_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_battle_reports_kingdom ON battle_reports (kingdom_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_battle_reports_season ON battle_reports (season_id);
CREATE INDEX IF NOT EXISTS idx_armies_kingdom ON armies (kingdom_id);
