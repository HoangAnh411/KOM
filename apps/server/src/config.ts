export const config = {
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  redisUrl: process.env.REDIS_URL ?? "",
  seasonDurationMs: Number(process.env.SEASON_DURATION_MS ?? 14 * 24 * 60 * 60 * 1000),
  tickMs: 1000
};
