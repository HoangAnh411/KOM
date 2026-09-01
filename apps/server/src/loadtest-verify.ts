import { Pool } from "pg";

// Verifies the outbox drain gate after a load test:
//   - backlog stays below 100 right after the run
//   - the oldest pending event is younger than 30 seconds (drain target)
// Run with LOADTEST_DATABASE_URL pointing at the *_loadtest database.

const databaseUrl = process.env.LOADTEST_DATABASE_URL;
if (!databaseUrl) throw new Error("LOADTEST_DATABASE_URL is required");
if (!/^[a-z0-9_]+_loadtest$/.test(new URL(databaseUrl).pathname.slice(1))) throw new Error(`refusing non-loadtest database "${new URL(databaseUrl).pathname.slice(1)}"`);

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
try {
  const result = await pool.query(`SELECT
    (SELECT count(*) FROM outbox_events WHERE published_at IS NULL AND dead_lettered_at IS NULL)::int AS backlog,
    (SELECT COALESCE(extract(epoch FROM now() - MIN((payload->>'createdAt')::timestamptz)), 0) FROM outbox_events WHERE published_at IS NULL AND dead_lettered_at IS NULL) AS oldest_seconds,
    (SELECT count(*) FROM outbox_events WHERE dead_lettered_at IS NOT NULL)::int AS dead_lettered`);
  const { backlog, oldest_seconds, dead_lettered } = result.rows[0];
  console.log(`outbox after load test: backlog=${backlog} oldest=${Number(oldest_seconds).toFixed(1)}s dead_lettered=${dead_lettered}`);
  const failures: string[] = [];
  if (backlog >= 100) failures.push(`backlog ${backlog} >= 100`);
  if (Number(oldest_seconds) > 30) failures.push(`oldest event ${Number(oldest_seconds).toFixed(1)}s > 30s (did the outbox worker drain?)`);
  if (failures.length) console.error(`OUTBOX GATE FAILED: ${failures.join("; ")}`);
  else console.log("outbox gate OK: backlog < 100 and drain < 30s");
  if (failures.length) process.exitCode = 1;
} finally {
  await pool.end();
}