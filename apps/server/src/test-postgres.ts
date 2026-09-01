import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const baseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!baseUrl) throw new Error("TEST_DATABASE_URL or DATABASE_URL is required");
const url = new URL(baseUrl);
if (!/^[a-z0-9_]+_test$/.test(url.pathname.slice(1))) throw new Error(`test database name must end with _test (got "${url.pathname.slice(1)}"); refusing to reset a non-test database`);
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? baseUrl;
process.env.DATABASE_URL = baseUrl; // migrations and the app read DATABASE_URL
process.env.RUN_POSTGRES_INTEGRATION = "1"; // npm test stays unit-only even when TEST_DATABASE_URL exists
console.log(`resetting test database ${url.host}${url.pathname}`);

const admin = new Pool({ connectionString: baseUrl, max: 1 });
try {
  await admin.query("DROP SCHEMA public CASCADE");
  await admin.query("CREATE SCHEMA public");
} catch (error) {
  console.warn(`schema reset failed (${error instanceof Error ? error.message : error}); continuing in case the database exists but schema is locked`);
} finally {
  await admin.end();
}

const distDir = fileURLToPath(new URL("../dist", import.meta.url));
const srcDir = fileURLToPath(new URL(".", import.meta.url));
const check = spawnSync(process.execPath, [fileURLToPath(new URL("../dist/migrate.js", import.meta.url)), "check"], { stdio: "ignore" });
const fromDist = check.status === 0;
const run = (args: string[]) => {
  const binaryArgs = fromDist ? [fileURLToPath(new URL("../dist/migrate.js", import.meta.url)), ...args] : ["--import", "tsx", fileURLToPath(new URL("./migrate.ts", import.meta.url)), ...args];
  const result = spawnSync(process.execPath, binaryArgs as string[], { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run(["up"]);
run(["up"]);
run(["check"]);
console.log(`migration ${url.pathname} OK (applied twice, checksum verified)`);

const tests = spawnSync(process.execPath, ["--test", "*.integration.test.js"], { stdio: "inherit", env: process.env, cwd: distDir });
process.exit(tests.status ?? 1);
