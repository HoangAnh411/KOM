import test from "node:test";
import assert from "node:assert/strict";
import { cosmeticCatalog } from "@kingdoms/shared";
import { GameStore } from "./store.js";

test("player hub grants welcome badges once and keeps ownership separate", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  const first = store.getPlayerHub(player.id);
  assert.equal(first.wallet.badges, 0);
  assert.equal(first.rewards.find(reward => reward.id === "welcome")?.eligible, true);

  const claimed = store.claimCosmeticReward(player.id, "cosmetics-welcome-1", "welcome");
  assert.notEqual(claimed, "already_processed");
  assert.equal((claimed as ReturnType<GameStore["getPlayerHub"]>).wallet.badges, 100);
  assert.equal(store.claimCosmeticReward(player.id, "cosmetics-welcome-1", "welcome"), "already_processed");
  assert.equal(store.getPlayerHub(player.id).wallet.badges, 100);
});

test("cosmetic purchase and equip enforce server price, slot and ownership", () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  store.claimCosmeticReward(player.id, "cosmetics-welcome-2", "welcome");
  const item = cosmeticCatalog.find(candidate => candidate.slot === "avatar_frame")!;
  assert.throws(() => store.purchaseCosmetic(player.id, "cosmetics-buy-1", "missing"), /UNKNOWN_COSMETIC/);
  assert.throws(() => store.equipCosmetic(player.id, "cosmetics-equip-1", "avatar_frame", item.id), /COSMETIC_NOT_OWNED/);
  const purchased = store.purchaseCosmetic(player.id, "cosmetics-buy-2", item.id);
  assert.equal((purchased as ReturnType<GameStore["getPlayerHub"]>).wallet.badges, 25);
  const equipped = store.equipCosmetic(player.id, "cosmetics-equip-2", "avatar_frame", item.id);
  assert.equal((equipped as ReturnType<GameStore["getPlayerHub"]>).equipped.avatar_frame, item.id);
  assert.throws(() => store.purchaseCosmetic(player.id, "cosmetics-buy-3", item.id), /COSMETIC_ALREADY_OWNED/);
});

test("cosmetic command rollback restores badges and claims", async () => {
  const store = new GameStore();
  const player = store.snapshot.players[0]!;
  await assert.rejects(store.executeCommand({ eventType: "cosmetics.claimed", aggregateType: "cosmetic", aggregateId: player.id, commandId: "cosmetics-rollback", actorPlayerId: player.id }, () => {
    store.claimCosmeticReward(player.id, "cosmetics-inner", "welcome");
    throw new Error("ROLLBACK_TEST");
  }), /ROLLBACK_TEST/);
  assert.equal(store.getPlayerHub(player.id).wallet.badges, 0);
  assert.equal(store.getPlayerHub(player.id).rewards.find(reward => reward.id === "welcome")?.claimed, false);
});
