import { createClient, type RedisClientType } from "redis";
import { config } from "./config.js";

let client: RedisClientType | null = null;
let connecting: Promise<unknown> | null = null;

export function redisClient(): RedisClientType | null {
  if (!config.redisUrl) return null;
  if (!client) {
    client = createClient({ url: config.redisUrl });
    client.on("error", () => undefined);
  }
  if (!client.isReady && !connecting) {
    connecting = client.connect().catch(error => { connecting = null; throw error; });
  }
  return client;
}

export async function redisReady(): Promise<RedisClientType> {
  const clientInstance = redisClient();
  if (!clientInstance) throw new Error("REDIS_URL is required");
  if (!clientInstance.isReady) await connecting;
  return clientInstance;
}

export async function redisPing(): Promise<boolean> {
  const clientInstance = redisClient();
  if (!clientInstance) return false;
  try {
    if (!clientInstance.isReady) await connecting;
    return await clientInstance.ping() === "PONG";
  } catch {
    return false;
  }
}

export async function redisClose(): Promise<void> {
  if (client) {
    if (connecting) await connecting;
    // quit() waits for a QUIT ack that some servers never send; disconnect() always releases the socket
    await client.disconnect().catch(() => undefined);
    client = null;
    connecting = null;
  }
}