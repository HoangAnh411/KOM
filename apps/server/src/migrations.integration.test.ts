import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const databaseUrl = process.env.TEST_DATABASE_URL;
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