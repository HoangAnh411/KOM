import assert from "node:assert/strict";
import test from "node:test";
import { worldExtent } from "@kingdoms/shared";
import { explorationContains, refreshExploration } from "./exploration.js";
import { createSeedState } from "./store.js";

test("season exploration reveals around own cities and remains after an army leaves", () => {
  const state = createSeedState();
  const player = state.players[0]!;
  const city = state.cities.find(item => item.playerId === player.id)!;
  const initial = refreshExploration(state, player.id);
  assert.equal(explorationContains(initial, city.x, city.y), true);
  assert.equal(explorationContains(initial, worldExtent - 1, worldExtent - 1), false);

  const army = state.armies.find(item => item.ownerPlayerId === player.id)!;
  army.x = worldExtent - 20;
  army.y = worldExtent - 20;
  const discovered = refreshExploration(state, player.id);
  assert.equal(explorationContains(discovered, army.x, army.y), true);
  assert.ok(discovered.revision > initial.revision);

  state.armies = state.armies.filter(item => item.id !== army.id);
  const afterLeaving = refreshExploration(state, player.id);
  assert.equal(explorationContains(afterLeaving, worldExtent - 20, worldExtent - 20), true);
  assert.equal(afterLeaving.revision, discovered.revision);
});

test("each player receives an independent compact exploration mask", () => {
  const state = createSeedState();
  const first = state.players[0]!;
  const second = state.players[1]!;
  const firstCity = state.cities.find(city => city.playerId === first.id)!;
  const secondCity = state.cities.find(city => city.playerId === second.id)!;
  const firstMask = refreshExploration(state, first.id);
  const secondMask = refreshExploration(state, second.id);
  assert.equal(explorationContains(firstMask, firstCity.x, firstCity.y), true);
  assert.equal(explorationContains(secondMask, secondCity.x, secondCity.y), true);
  assert.notEqual(firstMask.encodedMask, secondMask.encodedMask);
  assert.ok(firstMask.encodedMask.length < 1024, "mask stays compact enough for realtime snapshots");
});
