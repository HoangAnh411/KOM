CREATE TABLE IF NOT EXISTS game_state (
  state_key TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS players (id UUID PRIMARY KEY, user_id UUID NOT NULL, kingdom_id UUID NOT NULL, faction_id TEXT NOT NULL, display_name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS kingdoms (id UUID PRIMARY KEY, name TEXT NOT NULL, season_id UUID NOT NULL);
CREATE TABLE IF NOT EXISTS seasons (id UUID PRIMARY KEY, status TEXT NOT NULL, starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL, finalized_at TIMESTAMPTZ, config JSONB NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS factions (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS map_tiles (kingdom_id UUID NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, terrain TEXT NOT NULL, region_id UUID, PRIMARY KEY (kingdom_id, x, y));
CREATE TABLE IF NOT EXISTS regions (id UUID PRIMARY KEY, kingdom_id UUID NOT NULL, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cities (id UUID PRIMARY KEY, player_id UUID NOT NULL, kingdom_id UUID NOT NULL, name TEXT NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, intel_defense INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS buildings (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS city_buildings (city_id UUID NOT NULL, building_id TEXT NOT NULL, level INTEGER NOT NULL, PRIMARY KEY (city_id, building_id));
CREATE TABLE IF NOT EXISTS city_resources (city_id UUID PRIMARY KEY, food BIGINT NOT NULL, wood BIGINT NOT NULL, stone BIGINT NOT NULL, iron BIGINT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS build_queues (id UUID PRIMARY KEY, city_id UUID NOT NULL, queue_type TEXT NOT NULL, building_id TEXT NOT NULL, target_level INTEGER NOT NULL, started_at TIMESTAMPTZ NOT NULL, completes_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS resource_nodes (id UUID PRIMARY KEY, region_id UUID NOT NULL, resource_type TEXT NOT NULL, remaining BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS trade_routes (id UUID PRIMARY KEY, kingdom_id UUID NOT NULL, source_city_id UUID NOT NULL, destination_city_id UUID NOT NULL, status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS caravans (id UUID PRIMARY KEY, route_id UUID NOT NULL, owner_player_id UUID NOT NULL, progress NUMERIC NOT NULL, cargo JSONB NOT NULL, status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS armies (id UUID PRIMARY KEY, player_id UUID NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, supply NUMERIC NOT NULL);
CREATE TABLE IF NOT EXISTS battle_reports (id UUID PRIMARY KEY, kingdom_id UUID NOT NULL, attacker_id UUID NOT NULL, defender_id UUID NOT NULL, result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS alliances (id UUID PRIMARY KEY, kingdom_id UUID NOT NULL, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS alliance_members (alliance_id UUID NOT NULL, player_id UUID NOT NULL, role TEXT NOT NULL, contribution BIGINT NOT NULL DEFAULT 0, PRIMARY KEY (alliance_id, player_id));
CREATE TABLE IF NOT EXISTS diplomacy_treaties (id UUID PRIMARY KEY, kingdom_id UUID NOT NULL, proposer_id UUID NOT NULL, target_id UUID NOT NULL, treaty_type TEXT NOT NULL, status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS espionage_actions (id UUID PRIMARY KEY, actor_player_id UUID NOT NULL, target_player_id UUID NOT NULL, action_type TEXT NOT NULL, status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS region_resource_state (region_id UUID PRIMARY KEY, resource_remaining JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS world_events (id UUID PRIMARY KEY, kingdom_id UUID NOT NULL, event_type TEXT NOT NULL, starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL, modifier JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS economy_scores (season_id UUID NOT NULL, player_id UUID NOT NULL, score INTEGER NOT NULL, PRIMARY KEY (season_id, player_id));
CREATE TABLE IF NOT EXISTS diplomacy_scores (season_id UUID NOT NULL, player_id UUID NOT NULL, score INTEGER NOT NULL, PRIMARY KEY (season_id, player_id));
CREATE TABLE IF NOT EXISTS military_scores (season_id UUID NOT NULL, player_id UUID NOT NULL, score INTEGER NOT NULL, PRIMARY KEY (season_id, player_id));
CREATE TABLE IF NOT EXISTS season_snapshots (season_id UUID PRIMARY KEY, snapshot JSONB NOT NULL, checksum TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS season_rankings (season_id UUID NOT NULL, player_id UUID NOT NULL, overall_score NUMERIC NOT NULL, military_score INTEGER NOT NULL, economy_score INTEGER NOT NULL, diplomacy_score INTEGER NOT NULL, rank INTEGER NOT NULL, PRIMARY KEY (season_id, player_id));
CREATE TABLE IF NOT EXISTS player_reputation (player_id UUID PRIMARY KEY, score INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS legacy_records (id UUID PRIMARY KEY, owner_id UUID NOT NULL, season_id UUID NOT NULL, record_type TEXT NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS analytics_events (id UUID PRIMARY KEY, season_id UUID, player_id UUID, event_type TEXT NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS admin_actions (id UUID PRIMARY KEY, actor_id UUID, action_type TEXT NOT NULL, reason TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS outbox_events (id UUID PRIMARY KEY, event_type TEXT NOT NULL, payload JSONB NOT NULL, published_at TIMESTAMPTZ);
