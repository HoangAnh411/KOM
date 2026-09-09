import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import {
  ambushCommandSchema,
  adminCloseSeasonSchema,
  applyFormationPresetCommandSchema,
  createArmyCommandSchema,
  assignCommanderCommandSchema,
  attackCommandSchema,
  breakTreatyCommandSchema,
  buildCommandSchema,
  cityLayoutCommandSchema,
  caravanCommandSchema,
  cancelArmyOrderCommandSchema,
  contributeAllianceCommandSchema,
  counterIntelCommandSchema,
  createAllianceCommandSchema,
  escortCommandSchema,
  factions,
  factionIds,
  harvestCommandSchema,
  healTroopsCommandSchema,
  initialCommanderCatalog,
  commanderUnlockChapter,
  campaignMissions,
  joinAllianceCommandSchema,
  launchSpyCommandSchema,
  leaveAllianceCommandSchema,
  mergeArmyCommandSchema,
  moveArmyCommandSchema,
  manageAllianceMemberCommandSchema,
  onboardingAckCommandSchema,
  operationStartCommandSchema,
  operationActCommandSchema,
  operationTimeControlCommandSchema,
  setAllianceNoticeCommandSchema,
  openAllianceVoteCommandSchema,
  castAllianceVoteCommandSchema,
  cosmeticClaimCommandSchema,
  dailyQuestClaimCommandSchema,
  cosmeticEquipCommandSchema,
  cosmeticPurchaseCommandSchema,
  proposeTreatyCommandSchema,
  recruitCommandSchema,
  recruitReserveCommandSchema,
  reinforceArmyCommandSchema,
  transferArmyCommandSchema,
  returnArmyHomeCommandSchema,
  saveFormationPresetCommandSchema,
  respondTreatyCommandSchema,
  routeCommandSchema,
  startResearchCommandSchema,
  completeCampaignMissionCommandSchema,
  patrolCampaignCommandSchema,
  setFormationCommandSchema,
  trainTroopsCommandSchema,
  updateArmyCompositionCommandSchema,
  gameRules,
  PROTOCOL_VERSION,
  worldAssetId,
  worldChunkSize,
  worldExtent,
  worldMapDigest,
  type BattleHistoryResponse,
  type BattleReport,
  type ServerMessage,
  type WorldSnapshot
} from "@kingdoms/shared";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { RateLimiter } from "./rate-limit.js";
import { GameStore } from "./store.js";
import { AuthRepository, REFRESH_MS, dummyPasswordHash, hashPassword, normalizeUsername, validateCredentials, verifyPassword } from "./auth.js";
import { redisPing, redisClose } from "./redis.js";
import { explorationContains, fullExploration } from "./exploration.js";

// proxy-addr turns a hop count into exactly this predicate — trust the first `hops`
// addresses, which are the proxies we run, and read the client from the next one — but
// Fastify's option type takes the predicate and not the number, so it is spelled out.
// See `config.ts`: the boolean `true` here would trust the whole X-Forwarded-For chain
// and make `request.ip` a client-supplied string.
const trustedHops = config.trustProxy;
const trustProxy = trustedHops === false ? false : (_address: string, hop: number) => hop < trustedHops;

export function createServer(): { app: FastifyInstance; store: GameStore; start: () => Promise<void>; stop: () => Promise<void> } {
  const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', 'token', 'refreshToken', 'accessToken', 'password', 'passwordHash', 'req.body.password'] }, bodyLimit: 64 * 1024, requestTimeout: 15_000, trustProxy }); let store = new GameStore(); const limiter = new RateLimiter(); const auth = new AuthRepository(store.databasePool); const devTokens = new Map<string, string>(); const clients = new Map<WebSocket, string>(); const registry = new Registry(); collectDefaultMetrics({ register: registry, prefix: "kingdom_" }); let stateLoaded = false; let lastTickCompletedAt = 0; let shuttingDown = false;
  (app as any).decorateReply("setCookie", function (this: any, name: string, value: string, options: any) { const parts = [`${name}=${value}`, "HttpOnly", `SameSite=${options.sameSite ?? "Strict"}`, `Path=${options.path ?? "/api/auth"}`]; if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`); if (options.secure) parts.push("Secure"); this.header("set-cookie", parts.join("; ")); return this; });
  (app as any).decorateReply("clearCookie", function (this: any, name: string, options: any) { this.header("set-cookie", `${name}=; Max-Age=0; HttpOnly; SameSite=Strict; Path=${options.path ?? "/api/auth"}`); return this; });
  const commandCounter = new Counter({ name: "kingdom_commands_total", help: "Accepted and rejected game commands", labelNames: ["command", "result"], registers: [registry] });
  const commandDuration = new Histogram({ name: "kingdom_command_duration_ms", help: "Game command duration in milliseconds", labelNames: ["command"], registers: [registry] });
  const websocketConnections = new Gauge({ name: "kingdom_websocket_connections", help: "Currently authenticated WebSocket connections", registers: [registry] });
  const websocketDisconnects = new Counter({ name: "kingdom_websocket_disconnects_total", help: "Authenticated WebSocket disconnects", labelNames: ["code"], registers: [registry] });
  const tickDuration = new Histogram({ name: "kingdom_tick_duration_ms", help: "Server-authoritative tick duration", registers: [registry] });
  const tickLag = new Gauge({ name: "kingdom_tick_lag_ms", help: "Milliseconds since the last completed tick", registers: [registry] });
  const tickErrors = new Counter({ name: "kingdom_tick_errors_total", help: "Failed server ticks", registers: [registry] });
  const persistenceErrors = new Counter({ name: "kingdom_persistence_errors_total", help: "Database/readiness/save errors", registers: [registry] });
  const httpRequestCounter = new Counter({ name: "http_requests_total", help: "Total HTTP requests", labelNames: ["method", "route", "status_code"], registers: [registry] });
  const httpAuthFailCounter = new Counter({ name: "http_auth_failures_total", help: "HTTP Authentication failures", labelNames: ["route", "reason"], registers: [registry] });
  const wsAuthFailCounter = new Counter({ name: "kingdom_websocket_auth_failures_total", help: "WebSocket Authentication failures", labelNames: ["reason"], registers: [registry] });

  app.addHook("onResponse", (request, reply, done) => {
    const route = request.routeOptions.url ?? "unknown";
    httpRequestCounter.inc({ method: request.method, route, status_code: reply.statusCode });
    done();
  });
  app.addHook("onSend", (request, reply, payload, done) => {
    const route = request.routeOptions.url ?? "unknown";
    if (reply.statusCode === 401 || reply.statusCode === 403) {
      try {
        const body = typeof payload === "string" ? JSON.parse(payload) : null;
        if (body && typeof body.code === "string") {
          httpAuthFailCounter.inc({ route, reason: body.code });
        }
      } catch {
        // ignore
      }
    }
    done();
  });
  let saveTimer: NodeJS.Timeout | undefined; let tickTimer: NodeJS.Timeout | undefined; let tickRunning = false;
  const getSnapshot = (viewerId?: string): WorldSnapshot => {
    store.migrateLegacyState();
    store.onboarding.verify(store.snapshot);
    const exploration = viewerId ? store.explorationFor(viewerId) : fullExploration();
    // Alpha privacy: a viewer only sees their own battle reports in the
    // snapshot, capped to the 20 most recent.
    const battleReports = (viewerId ? store.snapshot.battleReports.filter(report => report.attacker.playerId === viewerId || report.defender.playerId === viewerId) : store.snapshot.battleReports).slice(-20);
    // A city's interior is what espionage is priced to reveal: `scout` returns resources
    // and buildings blurred by accuracy (`espionage.ts:60-62`), on a cooldown, for iron.
    // Sending every city's real stock to every client made that mission pointless and
    // handed out the economy of players nobody had scouted. Battle reports and spy
    // missions on the lines around this one were already viewer-scoped; cities were the
    // collection that was missed. Foreign entries keep what the map legitimately shows —
    // position, owner, name, frozen — and lose the interior. Zeroing rather than dropping
    // the fields keeps `WorldSnapshot` one shape, and no client panel reads a foreign
    // city's stock (they resolve their own city by `playerId` first).
    const cities = store.snapshot.cities.map(city => {
      const owner = store.findPlayer(city.playerId);
      const named = { ...city, playerName: owner?.displayName ?? "Unknown", factionId: owner?.factionId };
      if (!viewerId || city.playerId === viewerId) return { ...named, visibility: "own" as const };

      // A foreign city's identity is intelligence, not public map decoration.
      // The latest successful scout is an immutable observation: later economy
      // ticks must not silently turn an old report into live information.
      const scout = store.snapshot.spyMissions
        .filter(mission => mission.actorPlayerId === viewerId
          && mission.targetPlayerId === city.playerId
          && mission.missionType === "scout"
          && mission.status === "success"
          && mission.report)
        .sort((left, right) => Date.parse(right.completesAt) - Date.parse(left.completesAt))[0];
      const report = scout?.report as {
        resources?: typeof city.resources;
        buildings?: Record<string, number>;
        armies?: Array<{ id: string; x: number; y: number; strength: number }>;
      } | undefined;
      const concealed = { buildingPlots: [], queues: [] };
      if (!scout || !report) return {
        ...named,
        ...concealed,
        name: "Thành chưa xác định",
        playerName: "Không rõ",
        factionId: undefined,
        visibility: "unknown" as const,
        resources: { food: 0, wood: 0, stone: 0, iron: 0 },
        buildings: {},
      };
      return {
        ...named,
        ...concealed,
        visibility: "scouted" as const,
        resources: { food: 0, wood: 0, stone: 0, iron: 0, ...(report.resources ?? {}) },
        buildings: report.buildings ?? {},
        intel: {
          observedAt: scout.completesAt,
          accuracy: scout.accuracy,
          resources: report.resources,
          buildings: report.buildings,
          armies: report.armies,
        },
      };
    });
    // The world itself is not in here. It is authored in `@kingdoms/shared` and both
    // sides import it, so the snapshot names the world (`worldMapDigest`) and carries
    // only the tiles that differ from it (`terrainOverrides`, empty until something
    // writes `map_tiles`). This field used to be a tile-by-tile `terrainMap`: 6 323
    // bytes of never-changing data to every viewer every tick, and 21 061 at 36×36.
    // `regionControl` follows the same rule: sixteen province names, seats and tile
    // counts are authored data the client already has, so only the controller travels.
    const digest = worldMapDigest();
    const armies = store.snapshot.armies.filter(army => !viewerId || army.ownerPlayerId === viewerId || explorationContains(exploration, army.x, army.y));
    const progress = viewerId ? store.snapshot.campaignProgress[viewerId] : undefined;
    const completedChapter = viewerId ? Math.max(0, ...[1, 2, 3].filter(chapter => campaignMissions.filter(item => item.chapter === chapter).every(item => progress?.completedMissionIds.includes(item.id)))) : 3;
    const commanderCatalog = initialCommanderCatalog.filter(item => (commanderUnlockChapter[item.specialty] ?? 0) <= completedChapter);
    return { protocolVersion: PROTOCOL_VERSION, kingdom: store.snapshot.kingdom, season: { id: store.snapshot.season.id, status: store.snapshot.season.status, endsAt: store.snapshot.season.endsAt }, world: { id: worldAssetId, extent: worldExtent, chunkSize: worldChunkSize, digest, assetManifestUrl: `/assets/world3d/${worldAssetId}/manifest.json` }, exploration, cities, caravans: store.logistics.caravans(), armies, commanderCatalog, commanders: viewerId ? store.snapshot.commanders.filter(commander => commander.ownerPlayerId === viewerId) : store.snapshot.commanders, troopReserves: viewerId ? Object.fromEntries(Object.entries(store.snapshot.troopReserves).filter(([, reserve]) => reserve.ownerPlayerId === viewerId)) : store.snapshot.troopReserves, formationPresets: viewerId ? store.snapshot.formationPresets.filter(preset => preset.ownerPlayerId === viewerId) : store.snapshot.formationPresets, trainingQueues: viewerId ? Object.fromEntries(Object.entries(store.snapshot.trainingQueues).filter(([, queue]) => queue.items[0]?.cityId && store.findCity(queue.items[0].cityId)?.playerId === viewerId)) : store.snapshot.trainingQueues, hospitalQueues: viewerId ? Object.fromEntries(Object.entries(store.snapshot.hospitalQueues).filter(([, queue]) => queue.items[0]?.cityId && store.findCity(queue.items[0].cityId)?.playerId === viewerId)) : store.snapshot.hospitalQueues, technologyProgress: viewerId ? Object.fromEntries(Object.entries(store.snapshot.technologyProgress).filter(([playerId]) => playerId === viewerId)) : store.snapshot.technologyProgress, researchQueues: viewerId ? Object.fromEntries(Object.entries(store.snapshot.researchQueues).filter(([playerId]) => playerId === viewerId)) : store.snapshot.researchQueues, campaignProgress: viewerId ? Object.fromEntries(Object.entries(store.snapshot.campaignProgress).filter(([playerId]) => playerId === viewerId)) : store.snapshot.campaignProgress, activeOperation: viewerId ? store.snapshot.activeOperations[viewerId] : undefined, heroes: store.snapshot.heroes, scores: store.snapshot.scores, factionCatalog: factions, logistics: store.logistics.snapshot(), battleReports, worldMapDigest: digest, terrainOverrides: store.snapshot.terrainMap, regionControl: store.snapshot.regionControl, regionStates: store.snapshot.regionStates, rivalIntents: store.snapshot.rivalIntents, regionControlRevision: store.snapshot.regionControlRevision, alliances: store.snapshot.alliances, allianceVotes: store.snapshot.allianceVotes, treaties: store.snapshot.treaties, spyMissions: store.snapshot.spyMissions.filter(m => !viewerId || m.actorPlayerId === viewerId), worldEvents: store.snapshot.worldEvents, onboarding: store.onboarding.progressFor(viewerId), dailyQuests: viewerId ? store.dailyQuests.snapshotFor(store.snapshot, viewerId) : undefined };
  };
  let pendingBroadcast = false; const requestBroadcast = () => { pendingBroadcast = true; };
  const send = (socket: WebSocket, message: ServerMessage) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }; const doBroadcast = () => { for (const [client, playerId] of clients) send(client, { type: "SNAPSHOT", payload: getSnapshot(playerId) }); };
  // Live fight/cancel events go only to the players involved.
  const broadcastReport = (report: BattleReport) => { const participants = [report.attacker.playerId, report.defender.playerId].filter((id): id is string => Boolean(id)); for (const [client, playerId] of clients) if (participants.includes(playerId)) send(client, { type: "BATTLE_REPORT", payload: report }); };
  const playerFromRequest = async (request: { headers: { authorization?: string } }) => { const token = request.headers.authorization?.replace(/^Bearer\s+/i, ""); if (!token) return undefined; return config.authMode === "dev" ? devTokens.get(token) : (await auth.authenticateAccess(token))?.playerId; };
  // Fail-closed limiter: with Redis down in production consume() throws instead of letting the
  // request through. Report which of the two happened so callers answer 429 or 503, never a 500.
  const rateLimited = async (key: string, limit: number, windowMs: number): Promise<false | "RATE_LIMITED" | "DEPENDENCY_UNAVAILABLE"> => { try { return (await limiter.consume(key, limit, windowMs)) ? false : "RATE_LIMITED"; } catch (error) { if (error instanceof Error && error.message === "DEPENDENCY_UNAVAILABLE") return "DEPENDENCY_UNAVAILABLE"; throw error; } };
  // One bucket, one limit. The old code fed three different limits into a single `write:<player>`
  // counter, so six builds made the next spy command 429 (7 > 5). Membership is declared here
  // instead of at the call site so a limit can no longer disagree with the counter it consumes.
  const rateBuckets = { write: 20, combat: 10, spy: 5, read: 60 } as const;
  type RateBucket = keyof typeof rateBuckets;
  const commandBuckets: Record<string, RateBucket> = { spy_launch: "spy", counter_intel: "spy", recruit: "combat", recruit_reserve: "combat", create_army: "combat", reinforce_army: "combat", transfer_army: "combat", return_army_home: "combat", train_troops: "combat", heal_troops: "combat", start_research: "write", complete_campaign_mission: "combat", patrol_campaign: "combat", move_army: "combat", attack: "combat", cancel_army_order: "combat", set_formation: "combat", merge_army: "combat", ambush: "combat", assign_commander: "combat", update_army_composition: "combat", save_formation_preset: "combat", apply_formation_preset: "combat", operation_start: "combat", operation_act: "combat", operation_time_control: "write", daily_quest_claim: "write" };
  const limitReached = async (bucket: RateBucket, playerId: string) => rateLimited(`${bucket}:${playerId}`, rateBuckets[bucket], 60_000);
  app.addHook("onRequest", async (request, reply) => { if (config.authMode !== "password" || request.method !== "POST" || !request.raw.url?.startsWith("/api/auth/")) return; const origin = request.headers.origin; if (!origin || origin !== config.clientOrigin) return reply.code(403).send({ code: "ORIGIN_NOT_ALLOWED" }); });
  app.addHook("onSend", async (_request, reply) => { reply.header("X-Content-Type-Options", "nosniff"); reply.header("X-Frame-Options", "DENY"); reply.header("Referrer-Policy", "no-referrer"); reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"); reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()"); });
  const command = async (name: string, request: any, reply: any, action: (playerId: string) => unknown, onCommitted?: (result: unknown) => void) => { const started = performance.now(); const body = (request.body ?? {}) as { commandId?: string }; const playerId = await playerFromRequest(request); if (!playerId) return reply.code(401).send({ commandId: body.commandId ?? "", result: "rejected", code: "UNAUTHORIZED" }); const player = playerId ? store.findPlayer(playerId) : undefined; if (!player) return reply.code(401).send({ commandId: body.commandId ?? "", result: "rejected", code: "UNAUTHORIZED" }); if (player.status === "banned") return reply.code(403).send({ commandId: body.commandId ?? "", result: "rejected", code: "ACCOUNT_BANNED" }); const limited = await limitReached(commandBuckets[name] ?? "write", playerId); if (limited) return reply.code(limited === "RATE_LIMITED" ? 429 : 503).send({ commandId: body.commandId ?? "", result: "rejected", code: limited }); try { const executed = await store.executeCommand({ eventType: `${name}.accepted`, aggregateType: name, aggregateId: playerId, commandId: body.commandId, actorPlayerId: playerId }, () => action(playerId)); if (!executed.alreadyApplied) onCommitted?.(executed.result); commandCounter.inc({ command: name, result: "accepted" }); commandDuration.observe({ command: name }, performance.now() - started); requestBroadcast(); return { commandId: body.commandId ?? "", result: executed.alreadyApplied ? "already_processed" : "accepted", acceptedAt: new Date().toISOString(), snapshot: getSnapshot(playerId), data: executed.alreadyApplied ? undefined : executed.result }; } catch (error: any) { commandCounter.inc({ command: name, result: "rejected" }); commandDuration.observe({ command: name }, performance.now() - started); let message = error instanceof Error ? error.message : "INVALID_COMMAND"; if (error?.name === "ZodError") message = "INVALID_PAYLOAD"; if (message === "DEPENDENCY_UNAVAILABLE") return reply.code(503).send({ commandId: body.commandId ?? "", result: "rejected", code: message }); if (!/^[A-Z0-9_]+$/.test(message)) { request.log.error(error); return reply.code(500).send({ commandId: body.commandId ?? "", result: "rejected", code: "INTERNAL_ERROR" }); } return reply.code(message.includes("ACCESS") || message === "UNAUTHORIZED" || message === "TARGET_FROZEN" || message === "ACCOUNT_BANNED" ? 403 : 400).send({ commandId: body.commandId ?? "", result: "rejected", code: message }); } };
  app.register(cors, { origin: config.authMode === "password" ? config.clientOrigin : true, credentials: true, methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["content-type", "authorization"] }); app.get("/health", async () => ({ ok: true, service: "kingdoms-server" })); app.get("/health/live", async () => ({ ok: true }));
  app.get("/health/ready", async (_request, reply) => {
    const state = { ready: false, shuttingDown, stateLoaded, postgres: false, redis: false, tickFresh: false, checks: [] as string[] };
    if (shuttingDown) return reply.code(503).send({ ready: false, reason: "shutting_down" });
    if (!stateLoaded) return reply.code(503).send({ ready: false, reason: "state_not_loaded" });
    if (store.databasePool) { try { await store.databasePool.query("SELECT 1"); state.postgres = true; } catch { persistenceErrors.inc(); state.checks.push("postgres"); } } else { state.checks.push("postgres"); }
    state.redis = await redisPing(); if (!state.redis) state.checks.push("redis");
    const lagMs = lastTickCompletedAt > 0 ? Date.now() - lastTickCompletedAt : Number.POSITIVE_INFINITY; if (Number.isFinite(lagMs)) tickLag.set(lagMs); state.tickFresh = lagMs <= config.tickMs * 3; if (!state.tickFresh) state.checks.push("tick_lag");
    if (state.checks.length) return reply.code(503).send({ ready: false, reason: state.checks.length === 1 ? state.checks[0] : "unhealthy", checks: state.checks });
    return { ready: true };
  });
  app.get("/metrics", async (request, reply) => {
    if (config.authMode === "password") {
      const supplied = (request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
      const received = Buffer.from(supplied); const expected = Buffer.from(config.metricsToken);
      if (!received.length || received.length !== expected.length || !requireConstantTime(received, expected)) return reply.code(401).send({ code: "UNAUTHORIZED" });
    }
    if (lastTickCompletedAt > 0) tickLag.set(Date.now() - lastTickCompletedAt);
    websocketConnections.set(clients.size);
    return reply.type(registry.contentType).send(await registry.metrics());
  });
  app.post<{ Body: { username?: string; password?: string; displayName?: string; factionId?: string } }>("/api/auth/register", async (request, reply) => { if (config.authMode !== "password" || !store.databasePool) return reply.code(404).send({ code: "NOT_FOUND" }); const limited = await rateLimited(`register:${request.ip}`, 3, 3_600_000); if (limited) return reply.code(limited === "RATE_LIMITED" ? 429 : 503).send({ code: limited }); const username = normalizeUsername(request.body?.username ?? ""); const password = request.body?.password ?? ""; try { validateCredentials(username, password); const displayName = request.body?.displayName?.trim() || username; if (displayName.length < 2 || displayName.length > 32) return reply.code(400).send({ code: "INVALID_DISPLAY_NAME" }); const factionId = request.body?.factionId; if (!factionId || !factionIds.includes(factionId as typeof factionIds[number])) return reply.code(400).send({ code: "INVALID_REQUEST" }); const passwordHash = await hashPassword(password); const { player, session } = await store.runExclusive(async () => { const registration = store.createRegisteredPlayer(displayName, factionId as typeof factionIds[number]); try { const session = await auth.register(username, passwordHash, { ...registration, state: structuredClone(store.snapshot) }); await store.load(); return { player: store.findPlayer(registration.player.id)!, session }; } catch (error) { store.rollbackRegisteredPlayer(registration.player.id); throw error; } }); reply.setCookie("refresh_token", session.refreshToken, { httpOnly: true, sameSite: "strict", secure: config.cookieSecure, path: "/api/auth", maxAge: Math.floor(REFRESH_MS / 1000) }); return { token: session.accessToken, accessExpiresAt: session.accessExpiresAt, player, snapshot: getSnapshot(player.id) }; } catch (error: any) { if (error?.code === "23505") return reply.code(409).send({ code: "USERNAME_TAKEN" }); let message = error instanceof Error ? error.message : "INVALID_REQUEST"; if (message === "DEPENDENCY_UNAVAILABLE") return reply.code(503).send({ code: message }); if (!/^[A-Z0-9_]+$/.test(message)) { request.log.error(error); return reply.code(500).send({ code: "INTERNAL_ERROR" }); } return reply.code(400).send({ code: message }); } });
  app.post<{ Body: { username?: string; password?: string } }>("/api/auth/login", async (request, reply) => { if (config.authMode !== "password" || !store.databasePool) return reply.code(404).send({ code: "NOT_FOUND" }); const username = normalizeUsername(request.body?.username ?? ""); const limited = await rateLimited(`login:${request.ip}:${username}`, 5, 900_000); if (limited) return reply.code(limited === "RATE_LIMITED" ? 429 : 503).send({ code: limited }); const row = await auth.findUser(username); const validPassword = await verifyPassword(request.body?.password ?? "", row?.password_hash ?? await dummyPasswordHash()); if (!row || !validPassword || row.status === "banned") return reply.code(401).send({ code: "INVALID_CREDENTIALS" }); const user = { id: row.id, username, playerId: row.player_id, status: row.status }; const session = await auth.createSession(user); reply.setCookie("refresh_token", session.refreshToken, { httpOnly: true, sameSite: "strict", secure: config.cookieSecure, path: "/api/auth", maxAge: Math.floor(REFRESH_MS / 1000) }); return { token: session.accessToken, accessExpiresAt: session.accessExpiresAt, player: store.findPlayer(user.playerId), snapshot: getSnapshot(user.playerId) }; });
  app.post("/api/auth/refresh", async (request, reply) => { if ((request.headers.origin ?? "") !== config.clientOrigin) return reply.code(403).send({ code: "ORIGIN_NOT_ALLOWED" }); if (config.authMode !== "password") return reply.code(404).send({ code: "NOT_FOUND" }); const token = (request.headers.cookie ?? "").match(/(?:^|; )refresh_token=([^;]+)/)?.[1]; if (!token) return reply.code(401).send({ code: "UNAUTHORIZED" }); const limited = await rateLimited(`refresh:${request.ip}`, 30, 60_000); if (limited) return reply.code(limited === "RATE_LIMITED" ? 429 : 503).send({ code: limited }); const session = await auth.rotateRefresh(token); if (!session) { reply.clearCookie("refresh_token", { path: "/api/auth" }); return reply.code(401).send({ code: "UNAUTHORIZED" }); } reply.setCookie("refresh_token", session.refreshToken, { httpOnly: true, sameSite: "strict", secure: config.cookieSecure, path: "/api/auth", maxAge: Math.floor(REFRESH_MS / 1000) }); return { token: session.accessToken, accessExpiresAt: session.accessExpiresAt, player: store.findPlayer(session.user.playerId), snapshot: getSnapshot(session.user.playerId) }; });
  app.post("/api/auth/logout", async (request, reply) => { if ((request.headers.origin ?? "") !== config.clientOrigin) return reply.code(403).send({ code: "ORIGIN_NOT_ALLOWED" }); const token = (request.headers.cookie ?? "").match(/(?:^|; )refresh_token=([^;]+)/)?.[1]; if (token) await auth.revokeRefresh(token); reply.clearCookie("refresh_token", { path: "/api/auth" }); return { ok: true }; });
  app.post<{ Body: { displayName?: string; factionId?: string } }>("/api/auth/dev", async (request, reply) => { if (config.authMode !== "dev") return reply.code(404).send({ code: "NOT_FOUND" }); const limited = await rateLimited(`login:${request.ip}`, 30, 60_000); if (limited) return reply.code(limited === "RATE_LIMITED" ? 429 : 503).send({ code: limited }); const displayName = request.body?.displayName?.trim(); const factionId = request.body?.factionId; if (!displayName || !factionId || !factionIds.includes(factionId as typeof factionIds[number])) return reply.code(400).send({ code: "INVALID_DEV_ACCOUNT" }); const player = store.addDevPlayer(displayName, factionId as typeof factionIds[number]); store.recalculateScores(); const token = randomUUID(); devTokens.set(token, player.id); store.ledger.append({ eventType: "auth.accepted", aggregateType: "player", aggregateId: player.id, actorPlayerId: player.id, payload: { displayName: player.displayName, factionId: player.factionId } }); await store.save(); return { token, player, snapshot: getSnapshot(player.id) }; });
  // Dev-only test seam: discards the in-memory world and starts over from the seed.
  // Keeps e2e suites deterministic as each run creates permanent dev players.
  app.post("/api/dev/reset", async (_request, reply) => { if (config.authMode !== "dev") return reply.code(404).send({ code: "NOT_FOUND" }); devTokens.clear(); store = new GameStore(); await store.load(); store.recalculateScores(); stateLoaded = true; return { ok: true }; });
  // Dev-only deterministic combat target. Natural migration mobs move and may
  // die while a browser test is building its barracks, so they are unsuitable
  // as a stable fixture for realtime battle-report assertions.
  app.post("/api/dev/battle-target", async (request, reply) => {
    if (config.authMode !== "dev") return reply.code(404).send({ code: "NOT_FOUND" });
    const playerId = await playerFromRequest(request);
    if (!playerId) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const city = store.snapshot.cities.find(item => item.playerId === playerId);
    if (!city) return reply.code(404).send({ code: "CITY_NOT_FOUND" });
    const now = Date.now();
    const event = store.worldEvents.spawn(store.snapshot, "mob_migration", 0x7cba771e, now);
    const target = store.snapshot.armies.find(army => army.sourceWorldEventId === event.id);
    if (!target) return reply.code(500).send({ code: "TARGET_SPAWN_FAILED" });
    // Park the mob three tiles from the city, on whichever side is still on the board.
    target.x = city.x + 3 <= gameRules.map.extent - 1 ? city.x + 3 : city.x - 3;
    target.y = city.y;
    target.strength = 5;
    target.nextActionAt = new Date(now + 60 * 60 * 1000).toISOString();
    requestBroadcast();
    // This fixture is created outside the normal command/tick path. Push its
    // snapshot now so the browser can enable the attack action immediately.
    doBroadcast();
    return { targetArmyId: target.id };
  });
  app.post("/api/dev/army-v2", async (request, reply) => {
    if (config.authMode !== "dev") return reply.code(404).send({ code: "NOT_FOUND" });
    const playerId = await playerFromRequest(request);
    if (!playerId) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const city = store.snapshot.cities.find(item => item.playerId === playerId);
    if (!city) return reply.code(404).send({ code: "CITY_NOT_FOUND" });
    const commander = store.snapshot.commanders.find(item => item.ownerPlayerId === playerId && item.id === `commander-logistics-${playerId}`);
    if (!commander) return reply.code(500).send({ code: "COMMANDER_NOT_FOUND" });
    const valid = store.snapshot.armies.find(army => army.ownerPlayerId === playerId && army.homeCityId === city.id
      && army.x === city.x && army.y === city.y && army.commanderId === commander.id
      && army.composition?.frontline?.troopType === "shield_infantry"
      && army.composition.frontline.count === 10 && !army.composition.backline && !army.composition.flank);
    if (valid) return { armyId: valid.id };
    const assigned = commander.assignedArmyId ? store.snapshot.armies.find(army => army.id === commander.assignedArmyId && army.ownerPlayerId === playerId) : undefined;
    const armyId = assigned?.id ?? randomUUID();
    const fixture = { ownerType: "player" as const, ownerPlayerId: playerId, x: city.x, y: city.y, homeCityId: city.id, commanderId: commander.id, composition: { frontline: { id: `${armyId}-frontline`, troopType: "shield_infantry" as const, position: "frontline" as const, count: 10 }, backline: null, flank: null }, stance: "balanced" as const, unitType: "infantry" as const, strength: 10, morale: 100, formation: "line" as const, supply: 100, lastSupplyAt: new Date().toISOString(), targetX: undefined, targetY: undefined, attackOrder: undefined, returningHome: undefined, recoveryAt: undefined };
    if (assigned) Object.assign(assigned, fixture);
    else store.snapshot.armies.push({ id: armyId, ...fixture });
    commander.assignedArmyId = armyId;
    requestBroadcast(); doBroadcast();
    return { armyId };
  });
  app.get("/api/bootstrap", async (request, reply) => { const playerId = await playerFromRequest(request); if (!playerId) return reply.code(401).send({ code: "UNAUTHORIZED" }); const limited = await limitReached("read", playerId); if (limited) return reply.code(limited === "RATE_LIMITED" ? 429 : 503).send({ code: limited }); return { player: store.findPlayer(playerId), snapshot: getSnapshot(playerId) }; });
  app.get("/api/player-hub", async (request, reply) => { const playerId = await playerFromRequest(request); if (!playerId) return reply.code(401).send({ code: "UNAUTHORIZED" }); const limited = await limitReached("read", playerId); if (limited) return reply.code(limited === "RATE_LIMITED" ? 429 : 503).send({ code: limited }); store.onboarding.verify(store.snapshot); return store.getPlayerHub(playerId); });
  app.get("/api/season-history", async (request, reply) => { const playerId = await playerFromRequest(request); if (!playerId) return reply.code(401).send({ code: "UNAUTHORIZED" }); const limited = await limitReached("read", playerId); if (limited) return reply.code(limited === "RATE_LIMITED" ? 429 : 503).send({ code: limited }); return store.archiveForPlayer(playerId); });
  app.get<{ Querystring: { cursor?: string; limit?: string } }>("/api/battles", async (request, reply) => { const playerId = await playerFromRequest(request); if (!playerId) return reply.code(401).send({ code: "UNAUTHORIZED" }); const limited = await limitReached("read", playerId); if (limited) return reply.code(limited === "RATE_LIMITED" ? 429 : 503).send({ code: limited }); const rawLimit = request.query.limit; let limit = 20; if (rawLimit !== undefined) { if (!/^[1-9]\d*$/.test(rawLimit)) return reply.code(400).send({ code: "INVALID_LIMIT" }); limit = Math.min(50, Math.max(1, Number(rawLimit))); } let cursor: { createdAt: string; id: string } | undefined; if (request.query.cursor !== undefined) { try { const parsed = JSON.parse(Buffer.from(request.query.cursor, "base64url").toString("utf8")) as unknown; if (typeof parsed !== "object" || parsed === null || typeof (parsed as { createdAt?: unknown }).createdAt !== "string" || typeof (parsed as { id?: unknown }).id !== "string") throw new Error("malformed cursor"); const createdAt = (parsed as { createdAt: string }).createdAt; const id = (parsed as { id: string }).id; const parsedAt = new Date(createdAt); if (Number.isNaN(parsedAt.getTime()) || parsedAt.toISOString() !== createdAt || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("invalid cursor fields"); cursor = { createdAt, id }; } catch { return reply.code(400).send({ code: "INVALID_CURSOR" }); } } const items: BattleReport[] = []; let nextCursor: string | undefined; if (store.databasePool) { const sql = cursor ? "SELECT id, created_at, result FROM battle_reports WHERE (attacker_id=$1 OR defender_id=$1) AND (created_at, id) < ($2, $3) ORDER BY created_at DESC, id DESC LIMIT $4" : "SELECT id, created_at, result FROM battle_reports WHERE (attacker_id=$1 OR defender_id=$1) ORDER BY created_at DESC, id DESC LIMIT $2"; const rows = await store.databasePool.query<{ id: string; created_at: string | Date; result: unknown }>(sql, cursor ? [playerId, cursor.createdAt, cursor.id, limit + 1] : [playerId, limit + 1]); for (const row of rows.rows.slice(0, limit)) items.push((typeof row.result === "string" ? JSON.parse(row.result) : { ...(row.result as object) }) as BattleReport); if (rows.rows.length > limit) { const last = rows.rows[limit - 1]; const createdAt = last.created_at instanceof Date ? last.created_at.toISOString() : String(last.created_at); nextCursor = Buffer.from(JSON.stringify({ createdAt, id: last.id })).toString("base64url"); } } else { const sorted = store.snapshot.battleReports.filter(report => report.attacker.playerId === playerId || report.defender.playerId === playerId).sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? "") || (a.id > b.id ? -1 : a.id < b.id ? 1 : 0)); const start = cursor ? sorted.findIndex(report => report.resolvedAt === cursor.createdAt && report.id === cursor.id) + 1 : 0; const page = sorted.slice(start, start + limit); for (const report of page) items.push(report); if (sorted.length > start + limit) { const last = page[page.length - 1]; nextCursor = Buffer.from(JSON.stringify({ createdAt: last.resolvedAt ?? last.id, id: last.id })).toString("base64url"); } } const response: BattleHistoryResponse = { items, nextCursor }; return response; });
  const adminAuthorized = (request: any): boolean => { if (!config.adminToken) return false; const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? ""; const a = Buffer.from(supplied); const b = Buffer.from(config.adminToken); return a.length === b.length && requireConstantTime(a, b); };
  const requireConstantTime = (a: Buffer, b: Buffer): boolean => { try { return timingSafeEqual(a, b); } catch { return false; } };
  const moderate = async (request: any, reply: any, status: "active" | "banned") => { if (!config.adminToken) return reply.code(404).send({ code: "ADMIN_DISABLED" }); if (!adminAuthorized(request)) return reply.code(401).send({ code: "UNAUTHORIZED" }); const limited = await rateLimited(`admin:${request.ip}`, 10, 60_000); if (limited) return reply.code(limited === "RATE_LIMITED" ? 429 : 503).send({ code: limited }); const playerId = request.body?.playerId as string; const reason = String(request.body?.reason ?? "").trim(); if (!playerId || reason.length < 3) return reply.code(400).send({ code: "INVALID_REQUEST" }); if (!store.findPlayer(playerId)) return reply.code(404).send({ code: "PLAYER_NOT_FOUND" }); try { const result = await store.moderatePlayer(playerId, status, reason); requestBroadcast(); if (status === "banned") { const message: ServerMessage = { type: "SNAPSHOT", payload: getSnapshot(playerId) }; const payload = JSON.stringify(message); for (const [token, tokenPlayerId] of devTokens) if (tokenPlayerId === playerId) devTokens.delete(token); for (const [socket, connectedPlayerId] of clients) if (connectedPlayerId === playerId) socket.send(payload, error => { if (error) socket.terminate(); else socket.close(4401, "ACCOUNT_BANNED"); }); } return { accepted: true, playerId, status: store.findPlayer(playerId)?.status, frozen: status === "banned", alreadyApplied: result.alreadyApplied }; } catch (error) { request.log.error(error); return reply.code(500).send({ code: "MODERATION_FAILED" }); } };
  app.post("/api/admin/player/ban", (request, reply) => moderate(request, reply, "banned"));
  app.post("/api/admin/player/unban", (request, reply) => moderate(request, reply, "active"));
  app.post<{ Body: unknown }>("/api/commands/alliance/create", async (request, reply) => command("alliance_create", request, reply, playerId => { const c = createAllianceCommandSchema.parse(request.body); return store.diplomacy.createAlliance(c.commandId, c.name, c.tag, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/alliance/join", async (request, reply) => command("alliance_join", request, reply, playerId => { const c = joinAllianceCommandSchema.parse(request.body); return store.diplomacy.joinAlliance(c.commandId, c.allianceId, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/alliance/leave", async (request, reply) => command("alliance_leave", request, reply, playerId => { const c = leaveAllianceCommandSchema.parse(request.body); return store.diplomacy.leaveAlliance(c.commandId, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/alliance/contribute", async (request, reply) => command("alliance_contribute", request, reply, playerId => { const c = contributeAllianceCommandSchema.parse(request.body); return store.diplomacy.contributeAlliance(c.commandId, c.cityId, c.resources, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/alliance/member", async (request, reply) => command("alliance_member", request, reply, playerId => { const c = manageAllianceMemberCommandSchema.parse(request.body); return store.diplomacy.manageMember(c.commandId, c.targetPlayerId, c.action, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/alliance/notice", async (request, reply) => command("alliance_notice", request, reply, playerId => { const c = setAllianceNoticeCommandSchema.parse(request.body); return store.diplomacy.setNotice(c.commandId, c.notice, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/alliance/vote/open", async (request, reply) => command("alliance_vote_open", request, reply, playerId => { const c = openAllianceVoteCommandSchema.parse(request.body); return store.diplomacy.openVote(c.commandId, c.candidatePlayerId, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/alliance/vote/cast", async (request, reply) => command("alliance_vote_cast", request, reply, playerId => { const c = castAllianceVoteCommandSchema.parse(request.body); return store.diplomacy.castVote(c.commandId, c.voteId, c.vote, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/treaty/propose", async (request, reply) => command("treaty_propose", request, reply, playerId => { const c = proposeTreatyCommandSchema.parse(request.body); return store.diplomacy.proposeTreaty(c.commandId, c.targetPlayerId, c.treatyType, c.durationSeconds, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/treaty/respond", async (request, reply) => command("treaty_respond", request, reply, playerId => { const c = respondTreatyCommandSchema.parse(request.body); return store.diplomacy.respondTreaty(c.commandId, c.treatyId, c.accept, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/treaty/break", async (request, reply) => command("treaty_break", request, reply, playerId => { const c = breakTreatyCommandSchema.parse(request.body); return store.diplomacy.breakTreaty(c.commandId, c.treatyId, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/spy/launch", async (request, reply) => command("spy_launch", request, reply, playerId => { const c = launchSpyCommandSchema.parse(request.body); return store.espionage.launchMission(c.commandId, c.targetPlayerId, c.missionType, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/spy/counter-intel", async (request, reply) => command("counter_intel", request, reply, playerId => { const c = counterIntelCommandSchema.parse(request.body); return store.espionage.activateCounterIntel(c.commandId, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/build", async (request, reply) => command("build", request, reply, playerId => { const c = buildCommandSchema.parse(request.body); return store.startBuild(playerId, c.commandId, c.cityId, c.buildingId, c.queueType, c.plotX === undefined ? undefined : { x: c.plotX, y: c.plotY!, rotation: c.plotRotation }); }));
  app.post<{ Body: unknown }>("/api/commands/city-layout", async (request, reply) => command("city_layout", request, reply, playerId => { const c = cityLayoutCommandSchema.parse(request.body); return store.updateCityLayout(playerId, c.commandId, c.cityId, c.layoutVersion, c.expectedRevision, c.placements); }));
  app.post<{ Body: unknown }>("/api/commands/harvest", async (request, reply) => command("harvest", request, reply, playerId => { const c = harvestCommandSchema.parse(request.body); return store.logistics.harvest(c.commandId, c.nodeId, c.cityId, playerId, c.amount, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/routes", async (request, reply) => command("route", request, reply, playerId => { const c = routeCommandSchema.parse(request.body); return store.logistics.createRoute(c.commandId, c.sourceCityId, { kind: c.destinationKind ?? "city", id: c.destinationId ?? c.destinationCityId! }, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/caravans", async (request, reply) => command("caravan", request, reply, playerId => { const c = caravanCommandSchema.parse(request.body); return store.logistics.startCaravan(c.commandId, c.routeId, { food: 0, ...c.cargo }, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/escort", async (request, reply) => command("escort", request, reply, playerId => { const c = escortCommandSchema.parse(request.body); return store.logistics.escort(c.commandId, c.caravanId, c.armyId, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/ambush", async (request, reply) => command("ambush", request, reply, playerId => { const c = ambushCommandSchema.parse(request.body); return store.logistics.ambush(c.commandId, c.caravanId, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/recruit", async (request, reply) => command("recruit", request, reply, playerId => { const c = recruitCommandSchema.parse(request.body); const troopType = { infantry: "shield_infantry", archer: "archers", cavalry: "cavalry" } as const; return store.armyManagement.train(c.commandId, c.cityId, troopType[c.unitType], c.amount, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/recruit-reserve", async (request, reply) => command("recruit_reserve", request, reply, playerId => { const c = recruitReserveCommandSchema.parse(request.body); return store.armyManagement.recruitReserve(c.commandId, c.cityId, c.troopType, c.amount, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/army/create", async (request, reply) => command("create_army", request, reply, playerId => { const c = createArmyCommandSchema.parse(request.body); return store.armyManagement.createArmy(c.commandId, c.cityId, c.commanderId, c.composition, c.stance, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/army/reinforce", async (request, reply) => command("reinforce_army", request, reply, playerId => { const c = reinforceArmyCommandSchema.parse(request.body); return store.armyManagement.reinforce(c.commandId, c.armyId, c.troopType, c.amount, c.position, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/army/transfer", async (request, reply) => command("transfer_army", request, reply, playerId => { const c = transferArmyCommandSchema.parse(request.body); return store.armyManagement.transfer(c.commandId, c.sourceArmyId, c.targetArmyId, c.troopType, c.amount, c.sourcePosition, c.targetPosition, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/army/return-home", async (request, reply) => command("return_army_home", request, reply, playerId => { const c = returnArmyHomeCommandSchema.parse(request.body); return store.armyManagement.returnHome(c.commandId, c.armyId, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/research", async (request, reply) => command("start_research", request, reply, playerId => { const c = startResearchCommandSchema.parse(request.body); return store.progression.startResearch(c.commandId, c.technologyId, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/campaign/complete", async (request, reply) => command("complete_campaign_mission", request, reply, playerId => { const c = completeCampaignMissionCommandSchema.parse(request.body); return store.progression.completeMission(c.commandId, c.missionId, c.armyId, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/campaign/patrol", async (request, reply) => command("patrol_campaign", request, reply, playerId => { const c = patrolCampaignCommandSchema.parse(request.body); return store.progression.patrol(c.commandId, c.missionId, c.armyId, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/train", async (request, reply) => command("train_troops", request, reply, playerId => { const c = trainTroopsCommandSchema.parse(request.body); return store.armyManagement.train(c.commandId, c.cityId, c.troopType, c.amount, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/heal", async (request, reply) => command("heal_troops", request, reply, playerId => { const c = healTroopsCommandSchema.parse(request.body); return store.armyManagement.heal(c.commandId, c.cityId, c.troopType, c.amount, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/army/commander", async (request, reply) => command("assign_commander", request, reply, playerId => { const c = assignCommanderCommandSchema.parse(request.body); return store.armyManagement.assignCommander(c.commandId, c.armyId, c.commanderId, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/army/composition", async (request, reply) => command("update_army_composition", request, reply, playerId => { const c = updateArmyCompositionCommandSchema.parse(request.body); return store.armyManagement.updateComposition(c.commandId, c.armyId, c.composition, c.stance, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/formation-presets", async (request, reply) => command("save_formation_preset", request, reply, playerId => { const c = saveFormationPresetCommandSchema.parse(request.body); return store.armyManagement.savePreset(c.commandId, c.name, c.composition, c.stance, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/formation-presets/apply", async (request, reply) => command("apply_formation_preset", request, reply, playerId => { const c = applyFormationPresetCommandSchema.parse(request.body); return store.armyManagement.applyPreset(c.commandId, c.armyId, c.presetId, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/move-army", async (request, reply) => command("move_army", request, reply, playerId => { const c = moveArmyCommandSchema.parse(request.body); return store.combat.moveArmy(c.commandId, c.armyId, c.targetX, c.targetY, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/attack", async (request, reply) => command("attack", request, reply, playerId => { const c = attackCommandSchema.parse(request.body); return store.combat.attack(c.commandId, c.armyId, c.targetArmyId, playerId, store.snapshot, store.diplomacy); }, result => { if (result && typeof result === "object" && "victor" in result) broadcastReport(result as BattleReport); }));
  app.post<{ Body: unknown }>("/api/commands/cancel-army-order", async (request, reply) => command("cancel_army_order", request, reply, playerId => { const c = cancelArmyOrderCommandSchema.parse(request.body); return store.combat.cancelArmyOrder(c.commandId, c.armyId, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/formation", async (request, reply) => command("set_formation", request, reply, playerId => { const c = setFormationCommandSchema.parse(request.body); return store.combat.setFormation(c.commandId, c.armyId, c.formation, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/merge-army", async (request, reply) => command("merge_army", request, reply, playerId => { const c = mergeArmyCommandSchema.parse(request.body); return store.combat.mergeArmies(c.commandId, c.sourceArmyId, c.targetArmyId, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/onboarding/ack", async (request, reply) => command("onboarding_ack", request, reply, playerId => { const c = onboardingAckCommandSchema.parse(request.body); return store.onboarding.ackStep(c.commandId, playerId, c.step, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/cosmetics/claim", async (request, reply) => command("cosmetics_claim", request, reply, playerId => { const c = cosmeticClaimCommandSchema.parse(request.body); return store.claimCosmeticReward(playerId, c.commandId, c.rewardId); }));
  app.post<{ Body: unknown }>("/api/commands/cosmetics/purchase", async (request, reply) => command("cosmetics_purchase", request, reply, playerId => { const c = cosmeticPurchaseCommandSchema.parse(request.body); return store.purchaseCosmetic(playerId, c.commandId, c.itemId); }));
  app.post<{ Body: unknown }>("/api/commands/cosmetics/equip", async (request, reply) => command("cosmetics_equip", request, reply, playerId => { const c = cosmeticEquipCommandSchema.parse(request.body); return store.equipCosmetic(playerId, c.commandId, c.slot, c.itemId); }));
  app.post<{ Body: unknown }>("/api/commands/operation/start", async (request, reply) => command("operation_start", request, reply, playerId => { const c = operationStartCommandSchema.parse(request.body); return store.operations.start(c.commandId, c.armyId, c.templateId, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/operation/act", async (request, reply) => command("operation_act", request, reply, playerId => { const c = operationActCommandSchema.parse(request.body); return store.operations.act(c.commandId, c.operationId, c.decisionId, c.action, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/operation/time-control", async (request, reply) => command("operation_time_control", request, reply, playerId => { const c = operationTimeControlCommandSchema.parse(request.body); return store.operations.timeControl(c.commandId, c.operationId, c.action, c.speed, playerId, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/commands/daily-quest/claim", async (request, reply) => command("daily_quest_claim", request, reply, playerId => { const c = dailyQuestClaimCommandSchema.parse(request.body); return store.dailyQuests.claim(c.commandId, playerId, { questId: c.questId, milestone: c.milestone }, store.snapshot); }));
  app.post<{ Body: unknown }>("/api/admin/season/close", async (request, reply) => { if (!config.adminToken) return reply.code(503).send({ code: "ADMIN_DISABLED" }); if (!adminAuthorized(request)) return reply.code(401).send({ code: "UNAUTHORIZED" }); const limited = await rateLimited(`admin:${request.ip}`, 5, 60_000); if (limited) return reply.code(limited === "RATE_LIMITED" ? 429 : 503).send({ code: limited }); try { const body = adminCloseSeasonSchema.parse(request.body); const finalized = await store.runExclusive(() => store.finalizeIfDue({ force: true, reason: body.reason })); requestBroadcast(); return { accepted: finalized, status: finalized ? "finalized" : "already_finalized" }; } catch (error: any) { let message = error instanceof Error ? error.message : "INVALID_REQUEST"; if (error?.name === "ZodError") message = "INVALID_PAYLOAD"; if (message === "DEPENDENCY_UNAVAILABLE") return reply.code(503).send({ code: message }); if (!/^[A-Z0-9_]+$/.test(message)) { request.log.error(error); return reply.code(500).send({ code: "INTERNAL_ERROR" }); } return reply.code(400).send({ code: message }); } });
  const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false }); app.server.on("upgrade", (request, socket, head) => { const url = new URL(request.url ?? "/", "http://localhost"); if (url.pathname !== "/ws") { socket.destroy(); return; } if (config.authMode === "password" && (!request.headers.origin || request.headers.origin !== config.clientOrigin)) { socket.destroy(); return; } websocketServer.handleUpgrade(request, socket, head, client => websocketServer.emit("connection", client, request)); });
  websocketServer.on("connection", (socket: WebSocket) => { let authenticated = false; let isAlive = true; socket.on("pong", () => { isAlive = true; }); const pingTimer = setInterval(() => { if (!isAlive) return socket.terminate(); isAlive = false; socket.ping(); }, 30000); pingTimer.unref(); const timer = setTimeout(() => { if (!authenticated) { wsAuthFailCounter.inc({ reason: "TIMEOUT" }); socket.close(4401, "AUTH_REQUIRED"); } }, 5000); const authenticate = async (raw: string) => { const user = config.authMode === "dev" ? devTokens.get(raw) : (await auth.authenticateAccess(raw))?.playerId; if (!user || store.findPlayer(user)?.status === "banned") return false; authenticated = true; clearTimeout(timer); clients.set(socket, user); websocketConnections.set(clients.size); send(socket, { type: "SNAPSHOT", payload: getSnapshot(user) }); return true; }; socket.on("message", raw => { if (authenticated) return; try { const message = JSON.parse(raw.toString()) as { type?: string; token?: string }; if (message.type !== "AUTH" || !message.token) { wsAuthFailCounter.inc({ reason: "INVALID_FORMAT" }); return socket.close(4401, "AUTH_FAILED"); } void authenticate(message.token).then(ok => { if (!ok) { wsAuthFailCounter.inc({ reason: "INVALID_CREDENTIALS" }); socket.close(4401, "AUTH_FAILED"); } }); } catch { wsAuthFailCounter.inc({ reason: "BAD_JSON" }); socket.close(4401, "AUTH_FAILED"); } }); socket.on("close", code => { clearInterval(pingTimer); clearTimeout(timer); if (clients.delete(socket)) websocketDisconnects.inc({ code: String(code) }); websocketConnections.set(clients.size); }); });
  const start = async () => { if (config.authMode === "password" && !store.databasePool) throw new Error("DATABASE_REQUIRED"); await store.load(); store.recalculateScores(); stateLoaded = true; await app.listen({ host: config.host, port: config.port }); tickTimer = setInterval(() => { if (tickRunning) return; tickRunning = true; const started = performance.now(); void store.runExclusive(async () => { try { const changed = store.tick(); const battles = store.takeTickBattleReports(); const cancellations = store.takeTickCancellations(); if (battles.length) for (const report of battles) broadcastReport(report); if (cancellations.length) for (const cancellation of cancellations) { const owner = store.snapshot.armies.find(army => army.id === cancellation.armyId)?.ownerPlayerId; if (owner) for (const [client, playerId] of clients) if (playerId === owner) send(client, { type: "ATTACK_CANCELED", payload: cancellation }); } const finalized = await store.finalizeIfDue(); if (changed || finalized) { await store.save(); requestBroadcast(); } if (pendingBroadcast) { pendingBroadcast = false; doBroadcast(); } lastTickCompletedAt = Date.now(); tickLag.set(0); } catch (error) { tickErrors.inc(); app.log.error(error); } finally { tickDuration.observe(performance.now() - started); tickRunning = false; } }); }, config.tickMs); lastTickCompletedAt = Date.now(); saveTimer = setInterval(() => void store.runExclusive(() => store.save()).catch(error => { persistenceErrors.inc(); app.log.error(error); }), 10_000); };
  const stop = async () => {
    if (shuttingDown) return; shuttingDown = true;
    if (tickTimer) clearInterval(tickTimer); if (saveTimer) clearInterval(saveTimer);
    for (const socket of websocketServer.clients) { try { socket.close(1012, "SERVICE_RESTART"); } catch { /* already closed */ } }
    await new Promise<void>(resolve => app.server.close(() => resolve()));
    try { await store.runExclusive(() => store.save()); } catch (error) { app.log.error(error); }
    await store.close(); await limiter.close(); await redisClose(); await app.close();
  };
  app.addHook("onClose", async () => { if (tickTimer) clearInterval(tickTimer); if (saveTimer) clearInterval(saveTimer); await limiter.close(); await store.close(); await redisClose(); }); return { app, store, start, stop };
}
