import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  DATABASE_URL: z.string().default(""),
  REDIS_URL: z.string().default(""),
  SEASON_DURATION_MS: z.coerce.number().int().min(60_000).default(14 * 24 * 60 * 60 * 1000),
  ADMIN_TOKEN: z.string().default(""),
  METRICS_TOKEN: z.string().default(""),
  AUTH_MODE: z.enum(["dev", "password"]).default("dev"),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  ALLIANCE_LEADER_TERM_MS: z.coerce.number().int().min(60_000).default(7 * 24 * 60 * 60 * 1000),
  WORLD_EVENT_SPAWN_CHANCE: z.coerce.number().min(0).max(1).default(1 / 600),
  WORLD_EVENT_TYPE: z.string().default(""),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const detail = parsed.error.issues.map(issue => `  ${issue.path.join(".")}: ${issue.message}`).join("\n");
  throw new Error(`invalid environment configuration:\n${detail}`);
}
const env = parsed.data;

const isProduction = env.NODE_ENV === "production";
if (isProduction) {
  const violations: string[] = [];
  if (env.AUTH_MODE !== "password") violations.push("AUTH_MODE must be 'password' in production");
  if (!env.DATABASE_URL) violations.push("DATABASE_URL is required in production");
  if (!env.REDIS_URL) violations.push("REDIS_URL is required in production");
  if (env.ADMIN_TOKEN.length < 32) violations.push("ADMIN_TOKEN must be at least 32 characters in production");
  if (env.METRICS_TOKEN.length < 32) violations.push("METRICS_TOKEN must be at least 32 characters in production");
  if (env.CLIENT_ORIGIN) {
    try {
      const origin = new URL(env.CLIENT_ORIGIN);
      if (origin.protocol !== "https:" || origin.pathname !== "/" && origin.pathname !== "") violations.push("CLIENT_ORIGIN must be a bare HTTPS origin in production");
    } catch {
      violations.push("CLIENT_ORIGIN is not a valid URL in production");
    }
  }
  if (violations.length) throw new Error(`production configuration rejected:\n${violations.map(v => `  ${v}`).join("\n")}`);
}

function isValidOrigin(value: string): boolean {
  try {
    const origin = new URL(value);
    return ["http:", "https:"].includes(origin.protocol) && !origin.pathname.replace(/\/+$/, "") && !origin.search && !origin.hash;
  } catch {
    return false;
  }
}
if (!env.CLIENT_ORIGIN || !isValidOrigin(env.CLIENT_ORIGIN)) throw new Error(`invalid CLIENT_ORIGIN: ${env.CLIENT_ORIGIN || "(empty)"}`);

export const config = {
  nodeEnv: env.NODE_ENV,
  host: env.HOST,
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  seasonDurationMs: env.SEASON_DURATION_MS,
  tickMs: 1000,
  adminToken: env.ADMIN_TOKEN,
  metricsToken: env.METRICS_TOKEN,
  authMode: env.AUTH_MODE,
  clientOrigin: env.CLIENT_ORIGIN,
  cookieSecure: isProduction,
  allianceLeaderTermMs: env.ALLIANCE_LEADER_TERM_MS,
  worldEventSpawnChance: env.WORLD_EVENT_SPAWN_CHANCE,
  worldEventType: env.WORLD_EVENT_TYPE,
  trustProxy: env.TRUST_PROXY === "true"
};
export type AppConfig = typeof config;