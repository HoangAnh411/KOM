-- 014: Web Closed Alpha — battle history participant lookups for /api/battles.
-- Partial indexes serve the keyset-paginated "battles where I fight" query
-- (ORDER BY created_at DESC, id DESC) without scanning NPC-only rows
-- (raider battles insert NULL for attacker_id/defender_id, see 007).
-- Idempotent: safe on a fresh database, on any 001-013 database, and on re-run.

CREATE INDEX IF NOT EXISTS idx_battle_reports_attacker_id ON battle_reports (attacker_id, created_at DESC, id DESC) WHERE attacker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_battle_reports_defender_id ON battle_reports (defender_id, created_at DESC, id DESC) WHERE defender_id IS NOT NULL;