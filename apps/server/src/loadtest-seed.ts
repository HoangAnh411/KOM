import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Seeds a *_loadtest database directly so fixture setup never weakens or
// bypasses the public registration rate limit. Fresh access sessions are issued
// only after every account exists, giving all k6 users a full 15-minute window.
const fixturePath = fileURLToPath(new URL("../../../e2e/loadtest/loadtest-fixture.json", import.meta.url));
const databaseUrl = process.env.LOADTEST_DATABASE_URL;
const baseUrl = (process.env.LOADTEST_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const count = Number(process.env.LOADTEST_USERS ?? 120);

if (!databaseUrl) throw new Error("LOADTEST_DATABASE_URL is required");
const databaseName = new URL(databaseUrl).pathname.slice(1);
if (!/^[a-z0-9_]+_loadtest$/.test(databaseName)) throw new Error(`refusing to seed non-loadtest database "${databaseName}"`);
if (!Number.isInteger(count) || count < 100 || count > 500) throw new Error("LOADTEST_USERS must be an integer from 100 to 500");

process.env.DATABASE_URL = databaseUrl;
process.env.AUTH_MODE = "password";
const [{ GameStore, citySiteCapacity, seedCityTiles }, { AuthRepository, hashPassword }] = await Promise.all([import("./store.js"), import("./auth.js")]);
// A kingdom holds as many cities as the authored map has room for, and `LOADTEST_USERS` accepts up
// to 500. Asking for more than fits used to die of `KINGDOM_FULL` partway through, leaving a
// half-seeded database and an error naming neither the real limit nor the number asked for.
const capacity = citySiteCapacity();
const needed = count + seedCityTiles.length;
if (needed > capacity) throw new Error(`LOADTEST_USERS=${count} does not fit: the authored world holds ${capacity} cities and ${seedCityTiles.length} are already seeded, so ${capacity - seedCityTiles.length} users is the ceiling. Lower LOADTEST_USERS or author more anchors.`);
const store = new GameStore();
await store.load();
if (!store.databasePool) throw new Error("loadtest database is unavailable");
const auth = new AuthRepository(store.databasePool);

for (let index = 1; index <= count; index += 1) {
  const username = `loadtest_${index}`;
  let user = await auth.findUser(username);
  if (!user) {
    const passwordHash = await hashPassword(`Loadtest_${index}_Only!`, 1024);
    const registration = store.createRegisteredPlayer(`Load Test ${index}`, index % 2 ? "meridian" : "bastion");
    try {
      await auth.register(username, passwordHash, { ...registration, state: structuredClone(store.snapshot) });
      await store.load();
      user = await auth.findUser(username);
    } catch (error) {
      store.rollbackRegisteredPlayer(registration.player.id);
      throw error;
    }
  }
  if (!user || user.status !== "active") throw new Error(`loadtest user ${username} is missing or inactive`);
  if (index % 25 === 0) console.log(`prepared ${index}/${count}`);
}

await store.load();
const nodes = store.logistics.snapshot().resourceNodes.map(node => node.id);
if (!nodes.length) throw new Error("loadtest fixture has no resource nodes");
const users = [];
for (let index = 1; index <= count; index += 1) {
  const username = `loadtest_${index}`;
  const row = await auth.findUser(username);
  if (!row) throw new Error(`loadtest user ${username} disappeared`);
  await auth.revokePlayerSessions(row.player_id);
  const session = await auth.createSession({ id: row.id, username: row.username_normalized, playerId: row.player_id, status: "active" });
  const city = store.snapshot.cities.find(item => item.playerId === row.player_id);
  if (!city) throw new Error(`loadtest city missing for ${username}`);
  users.push({ username, token: session.accessToken, playerId: row.player_id, cityId: city.id });
}

// The public access-token lifetime is 15 minutes, equal to the steady test.
// Extend only these isolated load-test sessions so setup/startup time cannot
// turn the final requests into unrelated 401 responses.
await store.databasePool.query("UPDATE auth_sessions SET expires_at=now() + interval '30 minutes' WHERE player_id = ANY($1::uuid[]) AND revoked_at IS NULL", [users.map(user => user.playerId)]);
await writeFile(fixturePath, JSON.stringify({ baseUrl, generatedAt: new Date().toISOString(), users, nodes }, null, 2));
await store.close();
console.log(`loadtest fixture ready: ${users.length} users with fresh access tokens`);
