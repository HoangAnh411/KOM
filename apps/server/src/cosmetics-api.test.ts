import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "./app.js";

test("player hub endpoints return an authoritative catalog and idempotent transactions", async () => {
  const server = createServer();
  const login = await server.app.inject({ method: "POST", url: "/api/auth/dev", payload: { displayName: "Hub API Player", factionId: "meridian" } });
  const session = login.json() as { token: string };
  const headers = { authorization: `Bearer ${session.token}` };
  const hub = await server.app.inject({ method: "GET", url: "/api/player-hub", headers });
  assert.equal(hub.statusCode, 200);
  assert.equal(hub.json().catalog.length, 6);
  assert.equal(hub.json().rewards.find((reward: { id: string }) => reward.id === "welcome").eligible, true);

  const claim = await server.app.inject({ method: "POST", url: "/api/commands/cosmetics/claim", headers, payload: { commandId: "hub-api-claim-1", rewardId: "welcome" } });
  assert.equal(claim.statusCode, 200);
  assert.equal(claim.json().data.wallet.badges, 100);
  const repeat = await server.app.inject({ method: "POST", url: "/api/commands/cosmetics/claim", headers, payload: { commandId: "hub-api-claim-1", rewardId: "welcome" } });
  assert.equal(repeat.json().result, "already_processed");

  const buy = await server.app.inject({ method: "POST", url: "/api/commands/cosmetics/purchase", headers, payload: { commandId: "hub-api-buy-1", itemId: "frame_meridian" } });
  assert.equal(buy.statusCode, 200);
  assert.equal(buy.json().data.wallet.badges, 25);
  const equip = await server.app.inject({ method: "POST", url: "/api/commands/cosmetics/equip", headers, payload: { commandId: "hub-api-equip-1", slot: "avatar_frame", itemId: "frame_meridian" } });
  assert.equal(equip.json().data.equipped.avatar_frame, "frame_meridian");
  await server.app.close();
});
