import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { Counter, Histogram, Registry } from "prom-client";
import { buildCommandSchema, factions, factionIds, type ServerMessage, type WorldSnapshot } from "@kingdoms/shared";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { RateLimiter } from "./rate-limit.js";
import { GameStore } from "./store.js";

export function createServer(): { app: FastifyInstance; store: GameStore; start: () => Promise<void> } {
  const app = Fastify({ logger: true });
  const store = new GameStore();
  const limiter = new RateLimiter();
  const tokens = new Map<string, string>();
  const clients = new Set<WebSocket>();
  const registry = new Registry();
  const commandCounter = new Counter({ name: "kingdom_commands_total", help: "Accepted and rejected game commands", labelNames: ["command", "result"], registers: [registry] });
  const commandDuration = new Histogram({ name: "kingdom_command_duration_ms", help: "Game command duration in milliseconds", labelNames: ["command"], registers: [registry] });
  let saveTimer: NodeJS.Timeout | undefined;
  let tickTimer: NodeJS.Timeout | undefined;

  const getSnapshot = (): WorldSnapshot => ({
    kingdom: store.snapshot.kingdom,
    season: { id: store.snapshot.season.id, status: store.snapshot.season.status, endsAt: store.snapshot.season.endsAt },
    cities: store.snapshot.cities.map((city) => ({ ...city, playerName: store.findPlayer(city.playerId)?.displayName ?? "Unknown" })),
    caravans: store.snapshot.caravans,
    armies: store.snapshot.armies,
    heroes: store.snapshot.heroes,
    scores: store.snapshot.scores,
    factionCatalog: factions
  });
  const send = (socket: WebSocket, message: ServerMessage) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
  const broadcast = () => { const message: ServerMessage = { type: "SNAPSHOT", payload: getSnapshot() }; for (const client of clients) send(client, message); };
  const playerFromRequest = (request: { headers: { authorization?: string } }): string | undefined => {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    return token ? tokens.get(token) : undefined;
  };
  const rateLimited = async (key: string, limit: number, windowMs: number) => !(await limiter.consume(key, limit, windowMs));

  app.register(cors, { origin: true });
  app.get("/health", async () => ({ ok: true, service: "kingdoms-server" }));
  app.get("/metrics", async (_request, reply) => reply.type(registry.contentType).send(await registry.metrics()));
  app.post<{ Body: { displayName?: string; factionId?: string } }>("/api/auth/dev", async (request, reply) => {
    if (await rateLimited(`login:${request.ip}`, 10, 60_000)) return reply.code(429).send({ code: "RATE_LIMITED" });
    const displayName = request.body?.displayName?.trim();
    const factionId = request.body?.factionId;
    if (!displayName || !factionId || !factionIds.includes(factionId as typeof factionIds[number])) return reply.code(400).send({ code: "INVALID_DEV_ACCOUNT" });
    const player = store.addDevPlayer(displayName, factionId as typeof factionIds[number]);
    store.recalculateScores();
    const token = randomUUID(); tokens.set(token, player.id);
    await store.save();
    return { token, player, snapshot: getSnapshot() };
  });
  app.get("/api/bootstrap", async (request, reply) => {
    const playerId = playerFromRequest(request);
    if (!playerId) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (await rateLimited(`read:${playerId}`, 60, 60_000)) return reply.code(429).send({ code: "RATE_LIMITED" });
    return { player: store.findPlayer(playerId), snapshot: getSnapshot() };
  });
  app.post<{ Body: unknown }>("/api/commands/build", async (request, reply) => {
    const started = performance.now();
    const playerId = playerFromRequest(request);
    if (!playerId) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (await rateLimited(`write:${playerId}`, 20, 60_000)) { commandCounter.inc({ command: "build", result: "rate_limited" }); return reply.code(429).send({ code: "RATE_LIMITED" }); }
    try {
      const command = buildCommandSchema.parse(request.body);
      const result = store.startBuild(playerId, command.commandId, command.cityId, command.buildingId, command.queueType);
      commandCounter.inc({ command: "build", result });
      commandDuration.observe({ command: "build" }, performance.now() - started);
      await store.save(); broadcast();
      return { accepted: true, result, snapshot: getSnapshot() };
    } catch (error) {
      commandCounter.inc({ command: "build", result: "rejected" });
      commandDuration.observe({ command: "build" }, performance.now() - started);
      const message = error instanceof Error ? error.message : "INVALID_COMMAND";
      return reply.code(message === "CITY_ACCESS_DENIED" ? 403 : 400).send({ code: message });
    }
  });

  const websocketServer = new WebSocketServer({ noServer: true });
  app.server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws") return;
    const token = url.searchParams.get("token");
    const playerId = token ? tokens.get(token) : undefined;
    if (!playerId) { socket.destroy(); return; }
    websocketServer.handleUpgrade(request, socket, head, (client) => websocketServer.emit("connection", client, request, playerId));
  });
  websocketServer.on("connection", (socket: WebSocket, _request: unknown, playerId: string) => {
    clients.add(socket); send(socket, { type: "SNAPSHOT", payload: getSnapshot() });
    socket.on("message", async (raw) => {
      if (await rateLimited(`ws:${playerId}`, 30, 60_000)) { send(socket, { type: "ERROR", code: "RATE_LIMITED", message: "Too many commands" }); return; }
      try {
        const message = JSON.parse(raw.toString()) as { type?: string; payload?: unknown };
        if (message.type !== "BUILD_START") throw new Error("UNKNOWN_COMMAND");
        const command = buildCommandSchema.parse(message.payload);
        store.startBuild(playerId, command.commandId, command.cityId, command.buildingId, command.queueType);
        commandCounter.inc({ command: "build", result: "accepted_ws" });
        await store.save(); broadcast();
      } catch (error) { send(socket, { type: "ERROR", code: error instanceof Error ? error.message : "INVALID_COMMAND", message: "Command rejected" }); }
    });
    socket.on("close", () => clients.delete(socket));
  });

  const start = async () => {
    await store.load(); store.recalculateScores();
    await app.listen({ host: config.host, port: config.port });
    tickTimer = setInterval(() => { const changed = store.tick(); const finalized = store.finalizeIfDue(); if (changed || finalized) { void store.save(); broadcast(); } }, config.tickMs);
    saveTimer = setInterval(() => void store.save(), 10_000);
  };
  app.addHook("onClose", async () => { if (tickTimer) clearInterval(tickTimer); if (saveTimer) clearInterval(saveTimer); await store.save(); });
  return { app, store, start };
}
