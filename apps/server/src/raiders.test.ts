import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "./store.js";

test("raider engine keeps exactly RAIDER_TARGET_COUNT raiders, idempotently", () => {
  const store = new GameStore();
  const raiders = () => store.snapshot.armies.filter(army => army.ownerType === "npc" && army.npcKind === "raider");
  assert.equal(raiders().length, 3);
  store.raiders.seed(store.snapshot);
  store.raiders.seed(store.snapshot);
  assert.equal(raiders().length, 3);
});

test("raider spawn is deterministic: strength in [30..60], sequence advances", () => {
  const store = new GameStore();
  const raiders = store.snapshot.armies.filter(army => army.ownerType === "npc" && army.npcKind === "raider");
  assert.ok(raiders.length > 0);
  for (const raider of raiders) {
    assert.ok(raider.strength >= 30 && raider.strength <= 60, `strength ${raider.strength} out of range`);
    assert.equal(raider.ownerPlayerId, null);
    assert.equal(raider.formation, "line");
  }
  const first = raiders[0];
  assert.ok(first.x >= 0 && first.x < 20 && first.y >= 0 && first.y < 20);
  for (const city of store.snapshot.cities) {
    assert.ok(Math.abs(city.x - first.x) + Math.abs(city.y - first.y) >= 4, "raider spawned too close to a city");
  }
});

test("a dead raider is respawned one at a time after the respawn delay", () => {
  const store = new GameStore();
  store.snapshot.armies = store.snapshot.armies.filter(army => army.ownerType === "npc" && army.npcKind !== "raider");
  store.snapshot.raiderSpawnState = { sequence: 10, nextRespawnAt: new Date(Date.now() - 1).toISOString() };
  store.tick();
  const raiders = () => store.snapshot.armies.filter(army => army.ownerType === "npc" && army.npcKind === "raider");
  assert.equal(raiders().length, 1);
  store.tick();
  assert.equal(raiders().length, 1, "respawn must not burst");
  assert.ok(Date.parse(store.snapshot.raiderSpawnState.nextRespawnAt!) > Date.now() + 4 * 60_000);
});

test("raider respawn cooldown survives a restart: seed() must not top up", () => {
  const store = new GameStore();
  // Mid-season raid wiped the band; the raw cooldown record survives the restart.
  store.snapshot.raiderSpawnState.nextRespawnAt = new Date(Date.now() + 300_000).toISOString();
  store.snapshot.armies = store.snapshot.armies.filter(army => army.ownerType === "npc" && army.npcKind !== "raider");
  store.raiders.seed(store.snapshot);
  const raiders = () => store.snapshot.armies.filter(army => army.ownerType === "npc" && army.npcKind === "raider");
  assert.equal(raiders().length, 0, "seed after restart must wait for the cooldown");
  store.tick();
  assert.equal(raiders().length, 0, "future cooldown: nothing respawns");
  store.snapshot.raiderSpawnState.nextRespawnAt = new Date(Date.now() - 1).toISOString();
  store.tick();
  assert.equal(raiders().length, 1, "one respawn per cooldown window");
});

test("tick without a spawn record arms the cooldown rather than spawning instantly", () => {
  const store = new GameStore();
  const wiped = store.snapshot.armies.filter(army => army.ownerType === "npc" && army.npcKind !== "raider");
  store.snapshot.armies = wiped;
  store.snapshot.raiderSpawnState = { sequence: 7 };
  store.tick();
  const raiders = store.snapshot.armies.filter(army => army.ownerType === "npc" && army.npcKind === "raider");
  assert.equal(raiders.length, 0);
  assert.ok(store.snapshot.raiderSpawnState.nextRespawnAt, "cooldown record created");
  assert.ok(Date.parse(store.snapshot.raiderSpawnState.nextRespawnAt!) > Date.now());
});

test("raiders hunt player armies and use the shared combat resolver", () => {
  const store = new GameStore();
  const raider = store.snapshot.armies.find(army => army.ownerType === "npc" && army.npcKind === "raider")!;
  const attacker = store.snapshot.armies.find(army => army.ownerType === "player" && army.ownerPlayerId === store.snapshot.players[0].id)!;
  raider.x = 5; raider.y = 5;
  attacker.x = 6; attacker.y = 5;
  raider.nextActionAt = new Date(0).toISOString();
  store.tick();
  assert.equal(raider.x, 6, "raider moves toward the hunted army");
  assert.equal(raider.y, 5);
  const before = attacker.strength;
  raider.nextActionAt = new Date(0).toISOString();
  store.tick();
  const report = store.snapshot.battleReports.at(-1);
  assert.ok(report, "battle report created through the shared resolver");
  assert.equal(report.defender.armyId, attacker.id);
  assert.equal(report.attacker.armyId, raider.id);
  assert.equal(report.seed, report.seed);
  if (report.defender.strengthAfter < before) {
    assert.equal(attacker.strength, report.defender.strengthAfter, "resolver output applied to state");
  }
  if (report.victor === "attacker" && report.attacker.strengthAfter === 0) {
    assert.ok(!store.snapshot.armies.some(army => army.id === raider.id), "destroyed raider removed");
  }
});

test("raiders do not target cities or caravans", () => {
  const store = new GameStore();
  const raider = store.snapshot.armies.find(army => army.ownerType === "npc" && army.npcKind === "raider")!;
  const city = store.snapshot.cities[0];
  raider.x = city.x; raider.y = city.y;
  raider.nextActionAt = new Date(0).toISOString();
  store.tick();
  // no combat generated against the city or any caravan
  assert.ok(!store.snapshot.battleReports.some(report => report.defender.armyId === city.id));
  assert.ok(store.snapshot.caravans.every(caravan => caravan.status === "moving"));
});

test("a stale expired respawn timer is dropped once the band is full and restarts only on the next shortage", () => {
  const store = new GameStore();
  const raiders = () => store.snapshot.armies.filter(army => army.ownerType === "npc" && army.npcKind === "raider");
  assert.equal(raiders().length, 3);

  // Full band with a stale already-expired timer from an earlier shortfall.
  store.snapshot.raiderSpawnState.nextRespawnAt = new Date(Date.now() - 1).toISOString();
  store.tick();
  assert.equal(store.snapshot.raiderSpawnState.nextRespawnAt, undefined, "full band drops the stale timer");
  assert.equal(raiders().length, 3, "no instant spawn from the expired timer");

  // A raider dies: the first tick detecting the shortage arms a fresh cooldown.
  const victim = raiders()[0];
  store.snapshot.armies = store.snapshot.armies.filter(army => army.id !== victim.id);
  store.tick();
  assert.equal(raiders().length, 2, "no instant respawn right after the kill");
  assert.ok(store.snapshot.raiderSpawnState.nextRespawnAt, "cooldown armed only when the shortage is first seen");
  assert.ok(Date.parse(store.snapshot.raiderSpawnState.nextRespawnAt!) > Date.now() + 4 * 60_000, "cooldown measured from the shortage, not the stale expiry");

  // Once the cooldown elapses the band refills and the timer clears again.
  store.snapshot.raiderSpawnState.nextRespawnAt = new Date(Date.now() - 1).toISOString();
  store.tick();
  assert.equal(raiders().length, 3, "single respawn restored the band");
  assert.equal(store.snapshot.raiderSpawnState.nextRespawnAt, undefined, "timer cleared once full again");
});