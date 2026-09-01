-- NPC armies are explicit actors; player_id remains the canonical player owner column.
ALTER TABLE armies ALTER COLUMN player_id DROP NOT NULL;
ALTER TABLE armies ADD COLUMN IF NOT EXISTS owner_type TEXT NOT NULL DEFAULT 'player';
ALTER TABLE armies ADD COLUMN IF NOT EXISTS source_world_event_id UUID;
ALTER TABLE armies ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ;
ALTER TABLE armies DROP CONSTRAINT IF EXISTS armies_owner_type_check;
ALTER TABLE armies ADD CONSTRAINT armies_owner_type_check CHECK (
  (owner_type = 'player' AND player_id IS NOT NULL) OR
  (owner_type = 'npc' AND player_id IS NULL AND source_world_event_id IS NOT NULL)
);
ALTER TABLE battle_reports ALTER COLUMN attacker_id DROP NOT NULL;
ALTER TABLE battle_reports ALTER COLUMN defender_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_armies_world_event ON armies(source_world_event_id) WHERE owner_type = 'npc';
