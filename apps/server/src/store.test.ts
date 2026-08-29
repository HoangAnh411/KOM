import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "./store.js";

test("build commands enforce ownership, costs, and the two-queue limit", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0];
  const city = store.snapshot.cities.find((item) => item.playerId === player.id)!;
  assert.equal(store.startBuild(player.id, "command-001", city.id, "warehouse", "build"), "accepted");
  assert.equal(store.startBuild(player.id, "command-002", city.id, "road_depot", "build"), "accepted");
  assert.throws(() => store.startBuild(player.id, "command-003", city.id, "warehouse", "build"), /QUEUE_LIMIT_REACHED/);
  assert.throws(() => store.startBuild(store.snapshot.players[1].id, "command-004", city.id, "warehouse", "build"), /CITY_ACCESS_DENIED/);
  assert.equal(store.startBuild(player.id, "command-001", city.id, "warehouse", "build"), "already_processed");
});
