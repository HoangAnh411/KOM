import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, normalizeUsername, principalFromRow, validateCredentials, verifyPassword } from "./auth.js";

test("password hashing is salted and verifiable", async () => {
  validateCredentials("Player_01", "a sufficiently long password");
  const first = await hashPassword("a sufficiently long password", 1024);
  const second = await hashPassword("a sufficiently long password", 1024);
  assert.notEqual(first, second);
  assert.match(first, /^scrypt\$v=1\$/);
  assert.equal(await verifyPassword("a sufficiently long password", first), true);
  assert.equal(await verifyPassword("wrong password", first), false);
});

test("usernames normalize and validate the public policy", () => {
  assert.equal(normalizeUsername("  Player_01 "), "player_01");
  assert.throws(() => validateCredentials("ab", "a sufficiently long password"), /INVALID_USERNAME/);
  assert.throws(() => validateCredentials("valid_name", "short"), /INVALID_PASSWORD/);
});

test("database rows map to discriminated principals without fake players", () => {
  const base = { id: "user-1", username_normalized: "operator", password_hash: "not-returned", status: "active" as const };
  assert.deepEqual(principalFromRow({ ...base, role: "admin", player_id: null, player_status: null }), {
    kind: "admin", id: "user-1", username: "operator", status: "active"
  });
  assert.deepEqual(principalFromRow({ ...base, role: "player", player_id: "player-1", player_status: "active" }), {
    kind: "player", id: "user-1", username: "operator", playerId: "player-1", status: "active"
  });
  assert.equal(principalFromRow({ ...base, role: "player", player_id: null, player_status: null }), undefined);
});

test("production scrypt parameters are accepted by Node and verifiable", async () => {
  const encoded = await hashPassword("a production strength password");
  assert.match(encoded, /\$N=131072\$/);
  assert.equal(await verifyPassword("a production strength password", encoded), true);
});
