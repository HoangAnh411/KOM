import { createServer } from "node:http";
import { Pool } from "pg";
import { Counter, Gauge, Histogram, Registry } from "prom-client";
import { publishBatch, queueOutboxMetrics, OUTBOX_STREAM, OUTBOX_DLQ_STREAM } from "./outbox.js";
import { config } from "./config.js";
import { redisClose, redisReady } from "./redis.js";

if (!config.databaseUrl) throw new Error("DATABASE_URL is required for the outbox worker");
if (!config.redisUrl) throw new Error("REDIS_URL is required for the outbox worker");

const pool = new Pool({ connectionString: config.databaseUrl, max: 2 });
const redis = await redisReady();

const registry = new Registry();
const backlogGauge = new Gauge({ name: "outbox_backlog", help: "Pending outbox events not yet published", registers: [registry] });
const oldestAgeGauge = new Gauge({ name: "outbox_oldest_event_age_seconds", help: "Age of the oldest pending outbox event in seconds", registers: [registry] });
const dlqGauge = new Gauge({ name: "outbox_dead_lettered_total", help: "Outbox events moved to the dead-letter queue", registers: [registry] });
const publishedCounter = new Counter({ name: "outbox_published_total", help: "Outbox events published to Redis Streams", registers: [registry] });
const retryCounter = new Counter({ name: "outbox_retries_total", help: "Outbox publish attempts that were retried", registers: [registry] });
const dlqCounter = new Counter({ name: "outbox_dlq_transitions_total", help: "Outbox events dead-lettered", registers: [registry] });
const latency = new Histogram({ name: "outbox_publish_latency_ms", help: "Outbox XADD publish latency in milliseconds", buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000], registers: [registry] });

const metricsPort = Number(process.env.OUTBOX_METRICS_PORT ?? 9101);
const metricsServer = createServer(async (request, response) => {
  if (request.url === "/health/live") { response.writeHead(200).end("ok"); return; }
  if (request.url === "/metrics") {
    response.writeHead(200, { "content-type": registry.contentType });
    response.end(await registry.metrics());
    return;
  }
  response.writeHead(404).end();
});
metricsServer.listen(metricsPort, config.host);

const batchSize = Number(process.env.OUTBOX_BATCH_SIZE ?? 50);
const pollMs = Number(process.env.OUTBOX_POLL_MS ?? 500);
let stopping = false;
let wakeDelay: (() => void) | undefined;

async function tick(): Promise<void> {
  const started = performance.now();
  const report = await publishBatch(pool, redis, batchSize);
  const elapsed = performance.now() - started;
  publishedCounter.inc(report.published.length);
  retryCounter.inc(report.failed.length);
  dlqCounter.inc(report.deadLettered.length);
  if (report.published.length) latency.observe(elapsed);
  if (report.published.length || report.failed.length || report.deadLettered.length) console.log(`outbox batch: ${report.published.length} published, ${report.failed.length} retried, ${report.deadLettered.length} dead-lettered`);
}

async function refreshMetrics(): Promise<void> {
  try {
    const metrics = await queueOutboxMetrics(pool);
    backlogGauge.set(metrics.backlog);
    oldestAgeGauge.set(metrics.oldestAgeSeconds);
    dlqGauge.set(metrics.deadLettered);
  } catch (error) {
    console.warn("outbox metrics refresh failed", error instanceof Error ? error.message : error);
  }
}

async function loop(): Promise<void> {
  while (!stopping) {
    try {
      await tick();
      await refreshMetrics();
    } catch (error) {
      console.error("outbox worker tick failed", error instanceof Error ? error.message : error);
    }
    if (!stopping) await new Promise<void>(resolve => {
      wakeDelay = resolve;
      setTimeout(resolve, pollMs);
    });
    wakeDelay = undefined;
  }
}

let loopPromise: Promise<void> | undefined;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  console.log(`outbox worker received ${signal}, shutting down`);
  stopping = true;
  wakeDelay?.();
  await loopPromise;
  await new Promise<void>(resolve => metricsServer.close(() => resolve()));
  await redisClose();
  await pool.end();
  process.exitCode = 0;
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

console.log(`outbox worker started: stream=${OUTBOX_STREAM} dlq=${OUTBOX_DLQ_STREAM} batch=${batchSize} poll=${pollMs}ms metrics=:${metricsPort}`);
loopPromise = loop();
await loopPromise;
