import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, normalizeUsername, validateCredentials, verifyPassword } from "./auth.js";

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

test("production scrypt parameters are accepted by Node and verifiable", async () => {
  const encoded = await hashPassword("a production strength password");
  assert.match(encoded, /\$N=131072\$/);
  assert.equal(await verifyPassword("a production strength password", encoded), true);
});
