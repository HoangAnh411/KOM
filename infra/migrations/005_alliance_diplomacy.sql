-- Expand alliances table
ALTER TABLE alliances ADD COLUMN IF NOT EXISTS tag TEXT NOT NULL DEFAULT '';
ALTER TABLE alliances ADD COLUMN IF NOT EXISTS leader_player_id UUID;
ALTER TABLE alliances ADD COLUMN IF NOT EXISTS notice TEXT;
ALTER TABLE alliances ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Expand alliance_members
ALTER TABLE alliance_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT now();

-- Expand diplomacy_treaties
ALTER TABLE diplomacy_treaties ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NOT NULL DEFAULT 259200;
ALTER TABLE diplomacy_treaties ADD COLUMN IF NOT EXISTS proposed_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE diplomacy_treaties ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE diplomacy_treaties ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Diplomacy throughput stats per player per season
CREATE TABLE IF NOT EXISTS diplomacy_throughput (
  season_id UUID NOT NULL,
  player_id UUID NOT NULL,
  reputation INTEGER NOT NULL DEFAULT 0,
  treaties_honored INTEGER NOT NULL DEFAULT 0,
  treaties_violated INTEGER NOT NULL DEFAULT 0,
  alliance_contribution INTEGER NOT NULL DEFAULT 0,
  mediation_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (season_id, player_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_treaties_kingdom ON diplomacy_treaties (kingdom_id, status);
CREATE INDEX IF NOT EXISTS idx_alliance_kingdom ON alliances (kingdom_id);
