-- Phase 5: espionage and world events
ALTER TABLE espionage_actions ADD COLUMN IF NOT EXISTS kingdom_id UUID;
UPDATE espionage_actions AS action
SET kingdom_id = player.kingdom_id
FROM players AS player
WHERE action.actor_player_id = player.id
  AND action.kingdom_id IS NULL;
ALTER TABLE espionage_actions ADD COLUMN IF NOT EXISTS accuracy NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE espionage_actions ADD COLUMN IF NOT EXISTS cost JSONB NOT NULL DEFAULT '{}';
ALTER TABLE espionage_actions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE espionage_actions ADD COLUMN IF NOT EXISTS completes_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE espionage_actions ADD COLUMN IF NOT EXISTS report JSONB;
ALTER TABLE espionage_actions ADD COLUMN IF NOT EXISTS mission_type TEXT NOT NULL DEFAULT 'scout';
ALTER TABLE world_events ADD COLUMN IF NOT EXISTS affected_tiles JSONB NOT NULL DEFAULT '[]';
ALTER TABLE world_events ADD COLUMN IF NOT EXISTS severity INTEGER NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS counter_intel_active (player_id UUID PRIMARY KEY, activated_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS spy_cooldowns (player_id UUID NOT NULL, mission_type TEXT NOT NULL, available_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (player_id, mission_type));
CREATE INDEX IF NOT EXISTS idx_espionage_actions_kingdom ON espionage_actions (kingdom_id, completes_at);
