import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";

const databaseUrl = process.env.RUN_POSTGRES_INTEGRATION === "1" ? process.env.TEST_DATABASE_URL : undefined;
const migrateEntry = fileURLToPath(new URL("../dist/migrate.js", import.meta.url));

function runMigrate(arg: string, extraEnv: Record<string, string> = {}): { status: number; output: string } {
  const result = spawnSync(process.execPath, [migrateEntry, arg], { encoding: "utf8", env: { ...process.env, DATABASE_URL: databaseUrl, ...extraEnv } });
  return { status: result.status ?? 1, output: (result.stdout ?? "") + (result.stderr ?? "") };
}

test("migrate run is idempotent and check passes", { skip: !databaseUrl }, () => {
  const first = runMigrate("up");
  assert.equal(first.status, 0, first.output);
  const second = runMigrate("up");
  assert.equal(second.status, 0, second.output);
  const check = runMigrate("check");
  assert.equal(check.status, 0);
  assert.ok(check.output.includes("migration check OK"), check.output);
});

test("migration 016 preserves player sessions and legacy audit rows", { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  let client: PoolClient | undefined;
  const userId = "00000000-0000-4000-8000-000000000014";
  const playerId = "00000000-0000-4000-8000-000000000015";
  const sessionId = "00000000-0000-4000-8000-000000000016";
  const auditId = "00000000-0000-4000-8000-000000000017";
  const orphanAuditId = "00000000-0000-4000-8000-000000000018";
  const orphanActorId = "00000000-0000-4000-8000-000000000019";
  try {
    const migrationSql = await readFile(new URL("../../../infra/migrations/016_admin_console.sql", import.meta.url), "utf8");
    const connectedClient = await pool.connect();
    client = connectedClient;
    await connectedClient.query("BEGIN");
    await connectedClient.query("DELETE FROM auth_sessions WHERE id=$1", [sessionId]);
    await connectedClient.query("DELETE FROM admin_actions WHERE id IN ($1,$2)", [auditId, orphanAuditId]);
    await connectedClient.query("DROP INDEX IF EXISTS users_role_status_idx");
    await connectedClient.query("DROP INDEX IF EXISTS auth_sessions_principal_active_idx");
    await connectedClient.query("DROP INDEX IF EXISTS admin_actions_created_id_idx");
    await connectedClient.query("DROP INDEX IF EXISTS admin_actions_target_idx");
    await connectedClient.query("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check");
    await connectedClient.query("ALTER TABLE users DROP COLUMN IF EXISTS role");
    await connectedClient.query("ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS auth_sessions_principal_check");
    await connectedClient.query("ALTER TABLE auth_sessions DROP COLUMN IF EXISTS principal_type");
    await connectedClient.query("ALTER TABLE auth_sessions ALTER COLUMN player_id SET NOT NULL");
    await connectedClient.query("ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_actor_id_fkey");
    await connectedClient.query("ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_outcome_check");
    await connectedClient.query("ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_auth_method_check");
    await connectedClient.query("ALTER TABLE admin_actions DROP COLUMN IF EXISTS target_type");
    await connectedClient.query("ALTER TABLE admin_actions DROP COLUMN IF EXISTS target_id");
    await connectedClient.query("ALTER TABLE admin_actions DROP COLUMN IF EXISTS outcome");
    await connectedClient.query("ALTER TABLE admin_actions DROP COLUMN IF EXISTS auth_method");
    await connectedClient.query("ALTER TABLE admin_actions DROP COLUMN IF EXISTS request_id");
    await connectedClient.query("ALTER TABLE admin_actions DROP COLUMN IF EXISTS metadata");
    await connectedClient.query(
      "INSERT INTO users(id,username_normalized,password_hash,status) VALUES($1,$2,'test-hash','active') ON CONFLICT(id) DO NOTHING",
      [userId, `migration_${userId.slice(-4)}`]
    );
    const kingdomId = (await connectedClient.query<{ id: string }>("SELECT id FROM kingdoms LIMIT 1")).rows[0]?.id;
    assert.ok(kingdomId, "fresh migration should seed a kingdom");
    await connectedClient.query(
      "INSERT INTO players(id,user_id,kingdom_id,faction_id,display_name,status) VALUES($1,$2,$3,'meridian','Migration 016 Player','active') ON CONFLICT(id) DO NOTHING",
      [playerId, userId, kingdomId]
    );
    await connectedClient.query(
      "INSERT INTO auth_sessions(id,user_id,player_id,access_token_hash,refresh_token_hash,expires_at,refresh_expires_at,family_id) VALUES($1,$2,$3,$4,$5,now()+interval '1 hour',now()+interval '1 day',$6)",
      [sessionId, userId, playerId, `access-${sessionId}`, `refresh-${sessionId}`, sessionId]
    );
    await connectedClient.query(
      "INSERT INTO admin_actions(id,actor_id,action_type,reason) VALUES($1,NULL,'player.ban','pre-016 legacy row'),($2,$3,'player.unban','pre-016 orphan actor')",
      [auditId, orphanAuditId, orphanActorId]
    );

    await connectedClient.query(migrationSql);
    await connectedClient.query(migrationSql);

    const session = await connectedClient.query<{ principal_type: string; player_id: string }>(
      "SELECT principal_type,player_id FROM auth_sessions WHERE id=$1",
      [sessionId]
    );
    assert.equal(session.rows[0]?.principal_type, "player");
    assert.equal(session.rows[0]?.player_id, playerId);
    const audit = await connectedClient.query<{ auth_method: string; outcome: string; metadata: object }>(
      "SELECT auth_method,outcome,metadata FROM admin_actions WHERE id=$1",
      [auditId]
    );
    assert.equal(audit.rows[0]?.auth_method, "legacy_token");
    assert.equal(audit.rows[0]?.outcome, "applied");
    assert.deepEqual(audit.rows[0]?.metadata, {});
    const orphanAudit = await connectedClient.query<{ actor_id: string | null; auth_method: string; metadata: { actorClearedByMigration?: boolean } }>(
      "SELECT actor_id,auth_method,metadata FROM admin_actions WHERE id=$1",
      [orphanAuditId]
    );
    assert.equal(orphanAudit.rows[0]?.actor_id, null);
    assert.equal(orphanAudit.rows[0]?.auth_method, "legacy_token");
    assert.equal(orphanAudit.rows[0]?.metadata.actorClearedByMigration, true);
  } finally {
    await client?.query("ROLLBACK").catch(() => undefined);
    client?.release();
    await pool.end();
  }
});

test("checksum mismatch fails db:migrate:check", { skip: !databaseUrl }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "migrations-check-"));
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const migrations = fileURLToPath(new URL("../../../infra/migrations/", import.meta.url));
    await cp(migrations, dir, { recursive: true });
    await writeFile(join(dir, "990_fake.sql"), "CREATE TABLE IF NOT EXISTS fake_table_990 (id INT);\n");
    const up = runMigrate("up", { MIGRATIONS_DIR: dir });
    assert.equal(up.status, 0, up.output);
    await writeFile(join(dir, "990_fake.sql"), "CREATE TABLE IF NOT EXISTS fake_table_990 (id INT, x TEXT);\n");
    const check = runMigrate("check", { MIGRATIONS_DIR: dir });
    assert.notEqual(check.status, 0);
    assert.ok(check.output.includes("CHECKSUM MISMATCH") && check.output.includes("990_fake"), check.output);
    await pool.query("DROP TABLE IF EXISTS fake_table_990");
  } finally {
    await pool.end();
    await rm(dir, { recursive: true, force: true });
  }
});

test("baseline refuses a database already managed by the runner", { skip: !databaseUrl }, () => {
  const result = runMigrate("baseline");
  assert.notEqual(result.status, 0);
  assert.ok(result.output.includes("already has records"), result.output);
});

test("baseline refuses a malformed migration 016 schema", { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  let applied: Array<{ id: string; checksum: string; applied_at: Date }> = [];
  let indexDefinition: string | undefined;
  let migrationsDeleted = false;
  let indexDropped = false;
  try {
    applied = (await pool.query<{ id: string; checksum: string; applied_at: Date }>(
      "SELECT id,checksum,applied_at FROM schema_migrations"
    )).rows;
    indexDefinition = (await pool.query<{ definition: string }>(
      "SELECT pg_get_indexdef(indexrelid) AS definition FROM pg_index WHERE indexrelid=to_regclass('auth_sessions_principal_active_idx')"
    )).rows[0]?.definition;
    assert.ok(indexDefinition, "auth_sessions_principal_active_idx should exist before the test");

    await pool.query("DELETE FROM schema_migrations");
    migrationsDeleted = true;
    await pool.query("DROP INDEX auth_sessions_principal_active_idx");
    indexDropped = true;
    await pool.query("CREATE INDEX auth_sessions_principal_active_idx ON auth_sessions(user_id, principal_type, expires_at)");

    const result = runMigrate("baseline");
    assert.notEqual(result.status, 0);
    assert.ok(
      result.output.includes("baseline refused: indexes malformed auth_sessions_principal_active_idx"),
      result.output
    );
  } finally {
    try {
      if (indexDropped && indexDefinition) {
        await pool.query("DROP INDEX IF EXISTS auth_sessions_principal_active_idx");
        await pool.query(indexDefinition);
      }
    } finally {
      try {
        if (migrationsDeleted) {
          for (const row of applied) {
            await pool.query(
              "INSERT INTO schema_migrations(id,checksum,applied_at) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET checksum=EXCLUDED.checksum,applied_at=EXCLUDED.applied_at",
              [row.id, row.checksum, row.applied_at]
            );
          }
        }
      } finally {
        await pool.end();
      }
    }
  }
});
