import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Pool } from "pg";

const workspaceMigrations = new URL("../../../infra/migrations/", import.meta.url);
const migrationsDir = process.env.MIGRATIONS_DIR ? new URL(`file://${process.env.MIGRATIONS_DIR.replace(/\\/g, "/")}/`) : workspaceMigrations;
const ADVISORY_LOCK_KEY = 0x6b696e67; // "king" — advisory lock key for the migrate runner
const REQUIRED_TABLES = [
  "admin_actions", "alliance_members", "alliance_vote_ballots", "alliance_votes", "alliances", "analytics_events", "armies", "army_supply", "auth_sessions",
  "battle_reports", "build_queues", "buildings", "caravan_cargo", "caravans", "cities", "city_buildings", "city_resources", "counter_intel_active", "depots",
  "diplomacy_scores", "diplomacy_throughput", "diplomacy_treaties", "economy_scores", "economy_throughput", "espionage_actions", "event_ledger", "factions",
  "game_state", "kingdoms", "legacy_records", "logistics_commands", "map_tiles", "military_scores", "military_throughput", "outbox_events", "player_reputation",
  "players", "region_resource_state", "regions", "resource_nodes", "season_rankings", "season_snapshots", "seasons", "spy_cooldowns", "trade_routes", "users",
  "world_events"
];
const REQUIRED_INDEXES = [
  "event_ledger_command_idx", "event_ledger_aggregate_idx", "auth_sessions_access_hash_idx", "auth_sessions_refresh_hash_idx", "auth_sessions_user_idx",
  "auth_sessions_family_idx", "auth_sessions_player_active_idx", "auth_sessions_refresh_expiry_idx", "caravans_status_arrives_idx", "idx_alliance_kingdom",
  "idx_analytics_season_type", "idx_armies_kingdom", "idx_armies_world_event", "idx_battle_reports_kingdom", "idx_battle_reports_season",
  "idx_espionage_actions_kingdom", "idx_legacy_owner_season", "idx_treaties_kingdom", "resource_nodes_kingdom_idx", "players_user_id_idx",
  "users_username_normalized_idx", "idx_alliance_one_open_vote", "idx_seasons_kingdom_active", "idx_treaty_one_pending_pair"
];

const databaseUrl = process.env.DATABASE_URL;

async function checksumFile(name: string): Promise<string> {
  const raw = await readFile(new URL(name, migrationsDir), "utf8");
  return createHash("sha256").update(raw.replace(/\r\n/g, "\n").trimEnd() + "\n").digest("hex");
}

async function listMigrations(): Promise<string[]> {
  const files = (await readdir(migrationsDir)).filter(file => /^\d+_.+\.sql$/.test(file)).sort();
  return files;
}

async function withLock<T>(pool: Pool, action: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
    return await action();
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function ensureTable(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}

async function appliedMigrations(pool: Pool): Promise<Map<string, string>> {
  const result = await pool.query("SELECT id, checksum FROM schema_migrations");
  return new Map(result.rows.map((row: { id: string; checksum: string }) => [row.id, row.checksum]));
}

async function runUp(limit?: string, forReal = true): Promise<void> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  try {
    await withLock(pool, async () => {
      await ensureTable(pool);
      const applied = await appliedMigrations(pool);
      for (const file of await listMigrations()) {
        const id = file.replace(/\.sql$/, "");
        if (applied.has(id)) {
          if (applied.get(id) !== await checksumFile(file)) throw new Error(`checksum mismatch for migration ${id}; deploy stopped`);
          continue;
        }
        const sql = await readFile(new URL(file, migrationsDir), "utf8");
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query(sql);
          if (forReal) await client.query("INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)", [id, await checksumFile(file)]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          if (error instanceof Error) error.message = `migration ${id} failed: ${error.message}`;
          throw error;
        } finally {
          client.release();
        }
        console.log(`applied ${id}`);
        if (id === limit) return;
      }
    });
  } finally {
    await pool.end();
  }
}

async function runBaseline(): Promise<void> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  try {
    await withLock(pool, async () => {
      await ensureTable(pool);
      const applied = await appliedMigrations(pool);
      if (applied.size > 0) throw new Error("schema_migrations already has records; a migration runner manages this database");
      const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
      const existingTables = new Set(tables.rows.map((row: { table_name: string }) => row.table_name));
      const missingTables = REQUIRED_TABLES.filter(table => !existingTables.has(table));
      if (missingTables.length) throw new Error(`baseline refused: tables missing ${missingTables.join(", ")}`);
      const indexes = await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname='public'");
      const existingIndexes = new Set(indexes.rows.map((row: { indexname: string }) => row.indexname));
      const missingIndexes = REQUIRED_INDEXES.filter(index => !existingIndexes.has(index));
      if (missingIndexes.length) throw new Error(`baseline refused: indexes missing ${missingIndexes.join(", ")}`);
      for (const file of (await listMigrations()).filter(file => /^0\d\d_/.test(file))) {
        const id = file.replace(/\.sql$/, "");
        if (id === "012_outbox_worker") continue;
        await pool.query("INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)", [id, await checksumFile(file)]);
        console.log(`baselined ${id}`);
      }
      console.log(`baseline complete: ${REQUIRED_TABLES.length} tables and ${REQUIRED_INDEXES.length} indexes verified`);
    });
  } finally {
    await pool.end();
  }
}

async function runCheck(): Promise<void> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  let mismatches = 0;
  try {
    await withLock(pool, async () => {
      await ensureTable(pool);
      const applied = await appliedMigrations(pool);
      for (const file of await listMigrations()) {
        const id = file.replace(/\.sql$/, "");
        if (!applied.has(id)) { console.log(`pending ${id}`); mismatches += 1; continue; }
        if (applied.get(id) !== await checksumFile(file)) { console.error(`CHECKSUM MISMATCH ${id}`); mismatches += 1; }
      }
    });
    if (mismatches > 0) { console.error(`migration check FAILED (${mismatches} issues)`); process.exitCode = 1; return; }
    console.log("migration check OK");
  } finally {
    await pool.end();
  }
}

const command = process.argv[2] ?? "up";
const limit = process.argv[3];
switch (command) {
  case "up": await runUp(limit); break;
  case "baseline": await runBaseline(); break;
  case "check": await runCheck(); break;
  default: throw new Error(`unknown command ${command}; expected up|baseline|check`);
}