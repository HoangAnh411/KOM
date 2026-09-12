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
  "users_username_normalized_idx", "idx_alliance_one_open_vote", "idx_seasons_kingdom_active", "idx_treaty_one_pending_pair",
  "users_role_status_idx", "auth_sessions_principal_active_idx", "admin_actions_created_id_idx", "admin_actions_target_idx"
];
const REQUIRED_INDEX_DEFINITIONS: Record<string, { columns: string[]; predicate?: string }> = {
  users_role_status_idx: { columns: ["role", "status", "username_normalized", "id"] },
  auth_sessions_principal_active_idx: {
    columns: ["principal_type", "user_id", "expires_at"],
    predicate: "(revoked_at IS NULL)"
  },
  admin_actions_created_id_idx: { columns: ["created_at", "id"] },
  admin_actions_target_idx: { columns: ["target_type", "target_id", "created_at"] }
};
const REQUIRED_COLUMNS: Record<string, string[]> = {
  users: ["role"],
  auth_sessions: ["principal_type", "player_id"],
  admin_actions: ["target_type", "target_id", "outcome", "auth_method", "request_id", "metadata"]
};
const REQUIRED_CONSTRAINTS = [
  "users_role_check", "auth_sessions_principal_check", "admin_actions_actor_id_fkey",
  "admin_actions_outcome_check", "admin_actions_auth_method_check"
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
      const indexShapes = await pool.query(`SELECT ci.relname AS index_name,
        array_agg(a.attname ORDER BY keys.ordinality) FILTER (WHERE keys.attnum > 0) AS columns,
        pg_get_expr(i.indpred, i.indrelid) AS predicate
        FROM pg_index i
        JOIN pg_class ci ON ci.oid=i.indexrelid
        JOIN pg_namespace n ON n.oid=ci.relnamespace
        LEFT JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS keys(attnum, ordinality) ON true
        LEFT JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=keys.attnum
        WHERE n.nspname='public' AND ci.relname = ANY($1::text[])
        GROUP BY ci.relname,i.indpred,i.indrelid`, [Object.keys(REQUIRED_INDEX_DEFINITIONS)]);
      const actualIndexShapes = new Map(indexShapes.rows.map((row: { index_name: string; columns: string[]; predicate: string | null }) => [row.index_name, row]));
      const malformedIndexes = Object.entries(REQUIRED_INDEX_DEFINITIONS).filter(([name, expected]) => {
        const actual = actualIndexShapes.get(name);
        return !actual || actual.columns.join(",") !== expected.columns.join(",") || (actual.predicate ?? undefined) !== expected.predicate;
      }).map(([name]) => name);
      if (malformedIndexes.length) throw new Error(`baseline refused: indexes malformed ${malformedIndexes.join(", ")}`);
      const columns = await pool.query("SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public'");
      const existingColumns = new Map<string, { dataType: string; nullable: boolean; defaultValue: string | null }>();
      for (const row of columns.rows as Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string | null }>) {
        existingColumns.set(`${row.table_name}.${row.column_name}`, { dataType: row.data_type, nullable: row.is_nullable === "YES", defaultValue: row.column_default });
      }
      const missingColumns = Object.entries(REQUIRED_COLUMNS).flatMap(([table, names]) => names.filter(name => !existingColumns.has(`${table}.${name}`)).map(name => `${table}.${name}`));
      if (missingColumns.length) throw new Error(`baseline refused: columns missing ${missingColumns.join(", ")}`);
      if (!existingColumns.get("auth_sessions.player_id")?.nullable) throw new Error("baseline refused: auth_sessions.player_id must be nullable");
      const roleColumn = existingColumns.get("users.role");
      if (roleColumn?.dataType !== "text" || roleColumn.nullable || roleColumn.defaultValue !== "'player'::text") throw new Error("baseline refused: users.role must be text NOT NULL DEFAULT 'player'");
      const principalColumn = existingColumns.get("auth_sessions.principal_type");
      if (principalColumn?.dataType !== "text" || principalColumn.nullable || principalColumn.defaultValue !== "'player'::text") throw new Error("baseline refused: auth_sessions.principal_type must be text NOT NULL DEFAULT 'player'");
      const constraints = await pool.query("SELECT conname FROM pg_constraint JOIN pg_namespace ON pg_namespace.oid=pg_constraint.connamespace WHERE pg_namespace.nspname='public'");
      const existingConstraints = new Set(constraints.rows.map((row: { conname: string }) => row.conname));
      const missingConstraints = REQUIRED_CONSTRAINTS.filter(constraint => !existingConstraints.has(constraint));
      if (missingConstraints.length) throw new Error(`baseline refused: constraints missing ${missingConstraints.join(", ")}`);
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