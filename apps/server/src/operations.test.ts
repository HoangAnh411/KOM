import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "./store.js";
import { operationDurationMs, operationExtractionMs } from "./operations.js";

function scenario() {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const army = store.snapshot.armies.find(item => item.ownerPlayerId === player.id)!;
  return { store, player, army };
}

test("operation start locks one v2 army and presents a route decision", () => {
  const { store, player, army } = scenario();
  const run = store.operations.start("operation-start-1", army.id, "border_expedition", player.id, store.snapshot, 1_000);
  assert.equal(run.status, "AWAITING_DECISION");
  assert.equal(run.currentDecision?.id, "route");
  assert.equal(army.deployedOperationId, run.id);
  assert.throws(() => store.operations.start("operation-start-2", army.id, "border_expedition", player.id, store.snapshot), /OPERATION_ALREADY_ACTIVE/);
});

test("operation clock pauses, resumes and advances at 2x without touching world queues", () => {
  const { store, player, army } = scenario();
  const run = store.operations.start("operation-clock-1", army.id, "border_expedition", player.id, store.snapshot, 1_000);
  store.operations.act("operation-route-1", run.id, "route", "safe_route", player.id, store.snapshot, 1_000);
  store.operations.timeControl("operation-speed-1", run.id, "set_speed", 2, player.id, store.snapshot, 1_000);
  store.operations.tick(store.snapshot, 11_000);
  assert.equal(run.logicalElapsedMs, 20_000);
  store.operations.timeControl("operation-pause-1", run.id, "pause", undefined, player.id, store.snapshot, 11_000);
  store.operations.tick(store.snapshot, 21_000);
  assert.equal(run.logicalElapsedMs, 20_000);
  store.operations.timeControl("operation-resume-1", run.id, "resume", undefined, player.id, store.snapshot, 21_000);
  store.operations.tick(store.snapshot, 31_000);
  assert.equal(run.logicalElapsedMs, 40_000);
});

test("seeded operation variants and checksum reproduce for the same command sequence", () => {
  const first = scenario(); const second = scenario();
  second.store.snapshot.season.id = first.store.snapshot.season.id;
  second.army.ownerPlayerId = first.player.id;
  const a = first.store.operations.start("operation-seed-1", first.army.id, "border_expedition", first.player.id, first.store.snapshot, 0);
  const b = second.store.operations.start("operation-seed-1", second.army.id, "border_expedition", first.player.id, second.store.snapshot, 0);
  assert.deepEqual(a.variant, b.variant);
  first.store.operations.act("operation-route-seed", a.id, "route", "safe_route", first.player.id, first.store.snapshot, 0);
  second.store.operations.act("operation-route-seed", b.id, "route", "safe_route", first.player.id, second.store.snapshot, 0);
  a.logicalElapsedMs = b.logicalElapsedMs = operationExtractionMs;
  a.lastAdvancedAt = b.lastAdvancedAt = new Date(0).toISOString();
  first.store.operations.tick(first.store.snapshot, 1_000); second.store.operations.tick(second.store.snapshot, 1_000);
  first.store.operations.act("operation-contact-seed", a.id, "contact", "avoid", first.player.id, first.store.snapshot, 1_000);
  second.store.operations.act("operation-contact-seed", b.id, "contact", "avoid", first.player.id, second.store.snapshot, 1_000);
  a.logicalElapsedMs = b.logicalElapsedMs = operationExtractionMs;
  a.lastAdvancedAt = b.lastAdvancedAt = new Date(1_000).toISOString();
  first.store.operations.tick(first.store.snapshot, 2_000); second.store.operations.tick(second.store.snapshot, 2_000);
  first.store.operations.act("operation-extract-seed", a.id, "extraction", "extract", first.player.id, first.store.snapshot, 2_000);
  second.store.operations.act("operation-extract-seed", b.id, "extraction", "extract", first.player.id, second.store.snapshot, 2_000);
  assert.equal(a.checksum, b.checksum);
});

test("operation decisions are deterministic and settlement applies exactly once", () => {
  const { store, player, army } = scenario();
  const city = store.snapshot.cities.find(item => item.playerId === player.id)!;
  const run = store.operations.start("operation-settle-1", army.id, "border_expedition", player.id, store.snapshot, 0);
  store.operations.act("operation-route-2", run.id, "route", "risky_route", player.id, store.snapshot, 0);
  run.logicalElapsedMs = operationExtractionMs;
  run.lastAdvancedAt = new Date(0).toISOString();
  store.operations.tick(store.snapshot, 1_000);
  assert.equal(run.currentDecision?.id, "contact", "contact decision precedes extraction when skipped by a large clock jump");
  store.operations.act("operation-contact-1", run.id, "contact", "fortify", player.id, store.snapshot, 1_000);
  run.logicalElapsedMs = operationExtractionMs;
  run.lastAdvancedAt = new Date(1_000).toISOString();
  store.operations.tick(store.snapshot, 2_000);
  assert.equal(run.currentDecision?.id, "extraction");
  const wood = city.resources.wood;
  store.operations.act("operation-extract-1", run.id, "extraction", "extract", player.id, store.snapshot, 2_000);
  assert.equal(run.status, "COMPLETED");
  assert.equal(city.resources.wood, wood + 100);
  assert.equal(army.deployedOperationId, undefined);
  store.operations.tick(store.snapshot, operationDurationMs + 5_000);
  assert.equal(city.resources.wood, wood + 100, "settlement is not paid twice");
});
