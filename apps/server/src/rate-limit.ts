import { createClient, type RedisClientType } from "redis";
import { config } from "./config.js";

type Bucket = { count: number; resetAt: number };
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly redis?: RedisClientType;
  private readonly connecting?: Promise<unknown>;

  constructor() {
    if (config.redisUrl) {
      const client = createClient({ url: config.redisUrl });
      client.on("error", () => undefined);
      this.connecting = client.connect().catch(() => undefined);
      this.redis = client as RedisClientType;
    }
  }

  async consume(key: string, limit: number, windowMs: number): Promise<boolean> {
    if (this.redis) {
      if (!this.redis.isReady) {
        if (process.env.NODE_ENV === "production") throw new Error("DEPENDENCY_UNAVAILABLE");
      } else {
        try {
          const redisKey = `ratelimit:${key}:${Math.floor(Date.now() / windowMs)}`;
          const count = await this.redis.incr(redisKey);
          if (count === 1) await this.redis.pExpire(redisKey, windowMs);
          return count <= limit;
        } catch (error) {
          if (process.env.NODE_ENV === "production") throw new Error("DEPENDENCY_UNAVAILABLE");
        }
      }
    }
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) { this.buckets.set(key, { count: 1, resetAt: now + windowMs }); return true; }
    bucket.count += 1;
    return bucket.count <= limit;
  }

  async close(): Promise<void> {
    if (this.redis) {
      if (this.connecting) await this.connecting;
      await this.redis.disconnect().catch(() => undefined);
    }
  }
}
