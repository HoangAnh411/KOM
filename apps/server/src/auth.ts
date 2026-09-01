import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { CityState, GameState, Player } from "./types.js";

const USERNAME = /^[a-z0-9_]{3,32}$/;
const ACCESS_MS = 15 * 60 * 1000;
export const REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_SCRYPT_N = 131072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
type ScryptOptions = { N: number; r: number; p: number; maxmem: number };
const scrypt = (password: string, salt: string, keylen: number, options: ScryptOptions): Promise<Buffer> => new Promise((resolve, reject) => scryptCallback(password, salt, keylen, options, (error, result) => error ? reject(error) : resolve(result as Buffer)));
export type AuthUser = { id: string; username: string; playerId: string; status: "active" | "banned" };
export type AuthSession = { accessToken: string; refreshToken: string; user: AuthUser; accessExpiresAt: string };
export type RegisteredPlayer = { player: Player; city: CityState; state: GameState };

export function normalizeUsername(value: string): string { return value.trim().toLowerCase(); }
export function validateCredentials(username: string, password: string): void {
  if (!USERNAME.test(normalizeUsername(username))) throw new Error("INVALID_USERNAME");
  if (password.length < 12 || password.length > 128) throw new Error("INVALID_PASSWORD");
}
function digest(token: string): string { return createHash("sha256").update(token).digest("hex"); }
function equalHex(a: string, b: string): boolean { const left = Buffer.from(a, "hex"); const right = Buffer.from(b, "hex"); return left.length === right.length && timingSafeEqual(left, right); }
function scryptOptions(N: number, r = SCRYPT_R, p = SCRYPT_P): ScryptOptions { return { N, r, p, maxmem: Math.max(256 * 1024 * 1024, 128 * N * r + 1024 * 1024) }; }
export async function hashPassword(password: string, cost = DEFAULT_SCRYPT_N): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64, scryptOptions(cost));
  return `scrypt$v=1$N=${cost}$r=${SCRYPT_R}$p=${SCRYPT_P}$${salt}$${derived.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const match = /^scrypt\$v=1\$N=(\d+)\$r=(\d+)\$p=(\d+)\$([^$]+)\$([a-f0-9]+)$/.exec(encoded);
  if (!match) return false;
  const N = Number(match[1]); const r = Number(match[2]); const p = Number(match[3]);
  if (!Number.isInteger(N) || N < 1024 || N > DEFAULT_SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P) return false;
  const derived = await scrypt(password, match[4], match[5].length / 2, scryptOptions(N, r, p));
  return equalHex(derived.toString("hex"), match[5]);
}

let dummyHashPromise: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> { return dummyHashPromise ??= hashPassword("this password is never accepted"); }

export class AuthRepository {
  constructor(private readonly pool?: Pool) {}
  async findUser(username: string): Promise<any | undefined> { if (!this.pool) return undefined; const result = await this.pool.query("SELECT u.id, u.username_normalized, u.password_hash, u.status, p.id AS player_id FROM users u JOIN players p ON p.user_id=u.id WHERE u.username_normalized=$1", [normalizeUsername(username)]); return result.rows[0]; }

  async register(username: string, passwordHash: string, registration: RegisteredPlayer): Promise<AuthSession> {
    if (!this.pool) throw new Error("DATABASE_REQUIRED");
    const client = await this.pool.connect(); const userId = randomUUID();
    const user: AuthUser = { id: userId, username: normalizeUsername(username), playerId: registration.player.id, status: "active" };
    registration.player.userId = userId;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`state:${registration.state.kingdom.id}`]);
      const lockedState = await client.query<{ state: GameState }>("SELECT state FROM game_state WHERE state_key='kingdom' FOR UPDATE");
      await client.query("INSERT INTO users(id,username_normalized,password_hash,status) VALUES($1,$2,$3,'active')", [userId, user.username, passwordHash]);
      await client.query("INSERT INTO seasons(id,kingdom_id,status,starts_at,ends_at,config) VALUES($1,$2,$3,$4,$5,'{}') ON CONFLICT(id) DO NOTHING", [registration.state.season.id, registration.state.kingdom.id, registration.state.season.status, registration.state.season.startsAt, registration.state.season.endsAt]);
      await client.query("INSERT INTO kingdoms(id,name,season_id) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET season_id=EXCLUDED.season_id", [registration.state.kingdom.id, registration.state.kingdom.name, registration.state.season.id]);
      await client.query("INSERT INTO players(id,user_id,kingdom_id,faction_id,display_name,status) VALUES($1,$2,$3,$4,$5,'active')", [registration.player.id, userId, registration.player.kingdomId, registration.player.factionId, registration.player.displayName]);
      await client.query("INSERT INTO cities(id,player_id,kingdom_id,name,x,y,frozen) VALUES($1,$2,$3,$4,$5,$6,false)", [registration.city.id, registration.player.id, registration.player.kingdomId, registration.city.name, registration.city.x, registration.city.y]);
      await client.query("INSERT INTO city_resources(city_id,food,wood,stone,iron,frozen) VALUES($1,$2,$3,$4,$5,false)", [registration.city.id, registration.city.resources.food, registration.city.resources.wood, registration.city.resources.stone, registration.city.resources.iron]);
      await client.query("INSERT INTO city_buildings(city_id,building_id,level) VALUES($1,'town_hall',1)", [registration.city.id]);
      const currentState = lockedState.rows[0]?.state; const persistedState = currentState ? { ...currentState, players: [...currentState.players.filter(player => player.id !== registration.player.id), registration.player], cities: [...currentState.cities.filter(city => city.id !== registration.city.id), registration.city], scores: { ...currentState.scores, [registration.player.id]: registration.state.scores[registration.player.id] } } : registration.state;
      await client.query("INSERT INTO game_state(state_key,state) VALUES('kingdom',$1) ON CONFLICT(state_key) DO UPDATE SET state=EXCLUDED.state,updated_at=now()", [JSON.stringify(persistedState)]);
      const eventId = randomUUID(); const event = { id: eventId, eventType: "auth.registered", aggregateType: "player", aggregateId: registration.player.id, actorPlayerId: registration.player.id, payload: { userId, username: user.username }, createdAt: new Date().toISOString() };
      await client.query("INSERT INTO event_ledger(id,event_type,aggregate_type,aggregate_id,actor_player_id,payload,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)", [event.id, event.eventType, event.aggregateType, event.aggregateId, event.actorPlayerId, JSON.stringify(event.payload), event.createdAt]);
      await client.query("INSERT INTO outbox_events(id,event_type,payload) VALUES($1,$2,$3)", [event.id, event.eventType, JSON.stringify(event)]);
      const session = await this.insertSession(client, user);
      await client.query("COMMIT"); return session;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async createSession(user: AuthUser): Promise<AuthSession> {
    if (!this.pool) throw new Error("DATABASE_REQUIRED"); const client = await this.pool.connect();
    try { return await this.insertSession(client, user); } finally { client.release(); }
  }

  private async insertSession(client: Pick<PoolClient, "query">, user: AuthUser, familyId = randomUUID(), refreshExpiresAt: Date | string = new Date(Date.now() + REFRESH_MS), rotationCounter = 0): Promise<AuthSession> {
    const accessToken = randomBytes(32).toString("base64url"); const refreshToken = randomBytes(32).toString("base64url"); const now = Date.now();
    await client.query("INSERT INTO auth_sessions(id,user_id,player_id,access_token_hash,refresh_token_hash,expires_at,refresh_expires_at,rotation_counter,family_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [randomUUID(), user.id, user.playerId, digest(accessToken), digest(refreshToken), new Date(now + ACCESS_MS), refreshExpiresAt, rotationCounter, familyId]);
    return { accessToken, refreshToken, user, accessExpiresAt: new Date(now + ACCESS_MS).toISOString() };
  }

  async authenticateAccess(token: string): Promise<AuthUser | undefined> {
    if (!this.pool) return undefined;
    const result = await this.pool.query("SELECT u.id,u.username_normalized,u.status,p.id AS player_id FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN players p ON p.id=s.player_id WHERE s.access_token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL AND u.status='active' AND p.status='active'", [digest(token)]);
    const row = result.rows[0]; return row && { id: row.id, username: row.username_normalized, playerId: row.player_id, status: row.status };
  }

  async revokeRefresh(token: string): Promise<void> { if (this.pool) await this.pool.query("WITH family AS (SELECT family_id FROM auth_sessions WHERE refresh_token_hash=$1) UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()),updated_at=now() WHERE family_id IN (SELECT family_id FROM family)", [digest(token)]); }
  async revokePlayerSessions(playerId: string, client?: PoolClient): Promise<void> { const executor = client ?? this.pool; if (executor) await executor.query("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()),updated_at=now() WHERE player_id=$1 AND revoked_at IS NULL", [playerId]); }

  async rotateRefresh(token: string): Promise<AuthSession | undefined> {
    if (!this.pool) return undefined; const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query("SELECT s.*,u.username_normalized,u.status AS user_status,p.id AS player_id,p.status AS player_status FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN players p ON p.id=s.player_id WHERE s.refresh_token_hash=$1 FOR UPDATE", [digest(token)]); const row = result.rows[0];
      if (!row || row.revoked_at || row.user_status !== "active" || row.player_status !== "active" || new Date(row.refresh_expires_at).getTime() <= Date.now()) { if (row) await client.query("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()),updated_at=now() WHERE family_id=$1", [row.family_id]); await client.query("COMMIT"); return undefined; }
      await client.query("UPDATE auth_sessions SET revoked_at=now(),updated_at=now() WHERE id=$1", [row.id]);
      const user: AuthUser = { id: row.user_id, username: row.username_normalized, playerId: row.player_id, status: "active" };
      const session = await this.insertSession(client, user, row.family_id, row.refresh_expires_at, Number(row.rotation_counter) + 1);
      await client.query("COMMIT"); return session;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
}
