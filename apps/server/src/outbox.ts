import type { Pool } from "pg";
import type { RedisClientType } from "redis";

export const OUTBOX_STREAM = "kingdoms.events.v1";
export const OUTBOX_DLQ_STREAM = "kingdoms.events.dlq.v1";
export const MAX_ATTEMPTS = 10;
export const CLAIM_LEASE_MS = 30_000;
export const MAX_RETRY_MS = 5 * 60 * 1000;

export type OutboxRow = { id: string; eventType: string; payload: unknown; attemptCount: number };
export type OutboxEnvelope = { id: string; type: string; payload: unknown; createdAt: string };

export function retryDelayMs(attempt: number): number {
  return Math.min(1000 * 2 ** Math.max(0, attempt - 1), MAX_RETRY_MS);
}
export function shouldDeadLetter(attempt: number): boolean {
  return attempt >= MAX_ATTEMPTS;
}
export function toEnvelope(row: OutboxRow): OutboxEnvelope {
  const raw = (row.payload ?? {}) as { createdAt?: string };
  return { id: row.id, type: row.eventType, payload: row.payload, createdAt: raw.createdAt ?? new Date().toISOString() };
}

const CLAIM_SQL = `WITH pending AS (
  SELECT id FROM outbox_events
  WHERE published_at IS NULL AND dead_lettered_at IS NULL
    AND next_attempt_at <= now()
    AND (claimed_at IS NULL OR claimed_at < now() - make_interval(secs => $2))
  ORDER BY next_attempt_at
  FOR UPDATE SKIP LOCKED
  LIMIT $1
)
UPDATE outbox_events o SET claimed_at = now(), attempt_count = attempt_count + 1
FROM pending WHERE o.id = pending.id
RETURNING o.id, o.event_type AS "eventType", o.payload, o.attempt_count AS "attemptCount"`;

export async function claimBatch(pool: Pool, batchSize: number, leaseSeconds = CLAIM_LEASE_MS / 1000): Promise<OutboxRow[]> {
  const result = await pool.query<OutboxRow>(CLAIM_SQL, [batchSize, leaseSeconds]);
  return result.rows;
}

export async function markPublished(pool: Pool, id: string): Promise<void> {
  await pool.query("UPDATE outbox_events SET published_at = now(), claimed_at = NULL, last_error = NULL WHERE id = $1 AND published_at IS NULL", [id]);
}

export async function markFailed(pool: Pool, id: string, attempt: number, error: string): Promise<void> {
  const delaySeconds = Math.ceil(retryDelayMs(attempt) / 1000);
  await pool.query("UPDATE outbox_events SET claimed_at = NULL, last_error = $2, next_attempt_at = now() + make_interval(secs => $3) WHERE id = $1", [id, error.slice(0, 2000), delaySeconds]);
}

export async function deadLetter(pool: Pool, id: string, error: string): Promise<void> {
  await pool.query("UPDATE outbox_events SET dead_lettered_at = now(), claimed_at = NULL, last_error = $2 WHERE id = $1", [id, error.slice(0, 2000)]);
}

export type StreamPublisher = { xAdd(stream: string, entryId: string, fields: Record<string, string>): Promise<unknown> };

export type PublishReport = { published: string[]; failed: string[]; deadLettered: string[] };

export async function publishBatch(pool: Pool, redis: StreamPublisher, batchSize: number): Promise<PublishReport> {
  const report: PublishReport = { published: [], failed: [], deadLettered: [] };
  const rows = await claimBatch(pool, batchSize);
  for (const row of rows) {
    const envelope = toEnvelope(row);
    try {
      await redis.xAdd(OUTBOX_STREAM, "*", { event: JSON.stringify(envelope) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (shouldDeadLetter(row.attemptCount)) {
        try {
          await redis.xAdd(OUTBOX_DLQ_STREAM, "*", { event: JSON.stringify(envelope), error: message });
          await deadLetter(pool, row.id, message);
          report.deadLettered.push(row.id);
        } catch (dlqError) {
          const dlqMessage = dlqError instanceof Error ? dlqError.message : String(dlqError);
          await markFailed(pool, row.id, row.attemptCount, `${message}; DLQ publish failed: ${dlqMessage}`);
          report.failed.push(row.id);
        }
      } else {
        await markFailed(pool, row.id, row.attemptCount, message);
        report.failed.push(row.id);
      }
      continue;
    }
    try {
      await markPublished(pool, row.id);
      report.published.push(row.id);
    } catch {
      // Redis already accepted the event. Leave the claim leased so a later worker
      // redelivers the same envelope id instead of incorrectly dead-lettering it.
      report.failed.push(row.id);
    }
  }
  return report;
}

export async function queueOutboxMetrics(pool: Pool): Promise<{ backlog: number; oldestAgeSeconds: number; deadLettered: number }> {
  const result = await pool.query(`SELECT
    (SELECT count(*) FROM outbox_events WHERE published_at IS NULL AND dead_lettered_at IS NULL)::int AS backlog,
    (SELECT COALESCE(extract(epoch FROM now() - MIN((payload->>'createdAt')::timestamptz)), 0) FROM outbox_events WHERE published_at IS NULL AND dead_lettered_at IS NULL) AS oldest_age_seconds,
    (SELECT count(*) FROM outbox_events WHERE dead_lettered_at IS NOT NULL)::int AS dead_lettered`);
  return { backlog: result.rows[0].backlog, oldestAgeSeconds: Number(result.rows[0].oldest_age_seconds), deadLettered: result.rows[0].dead_lettered };
}
