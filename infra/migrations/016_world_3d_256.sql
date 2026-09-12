-- Existing seasons keep the coordinate system they were created with. New
-- seasons default to the 256x256 3D world; there is deliberately no in-place
-- coordinate migration for live armies, cities, routes or reports.
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS world_id TEXT;
UPDATE seasons SET world_id = 'meridian-36-v1' WHERE world_id IS NULL;
ALTER TABLE seasons ALTER COLUMN world_id SET DEFAULT 'meridian-256-v2';
ALTER TABLE seasons ALTER COLUMN world_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS seasons_world_id_idx ON seasons (world_id, starts_at DESC);
