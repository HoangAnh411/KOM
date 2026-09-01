ALTER TABLE seasons ADD COLUMN IF NOT EXISTS kingdom_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_seasons_kingdom_active ON seasons(kingdom_id) WHERE status IN ('ACTIVE', 'FINALIZING');
ALTER TABLE legacy_records ADD COLUMN IF NOT EXISTS template_version TEXT NOT NULL DEFAULT 'v1_hard_reset';
CREATE INDEX IF NOT EXISTS idx_legacy_owner_season ON legacy_records(owner_id, season_id);
CREATE INDEX IF NOT EXISTS idx_analytics_season_type ON analytics_events(season_id, event_type);
