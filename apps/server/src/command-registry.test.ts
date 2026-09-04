import test from "node:test";
import assert from "node:assert/strict";
import { CommandRegistry } from "./command-registry.js";

// Small windows on purpose: eviction is the property that used to be missing, so every test that
// cares about it needs to reach the bound in a few lines.

test("a command id can only be claimed once", () => {
  const registry = new CommandRegistry(10);

  assert.equal(registry.claim("cmd-1"), true);
  assert.equal(registry.claim("cmd-1"), false, "the second claim is the retry the caller answers already_processed");
  assert.equal(registry.has("cmd-1"), true);
  assert.equal(registry.has("cmd-2"), false);
  assert.equal(registry.size, 1);
});

test("the window is a bound: the oldest claim is evicted, not the newest", () => {
  const registry = new CommandRegistry(3);
  for (const id of ["cmd-1", "cmd-2", "cmd-3", "cmd-4"]) registry.claim(id);

  assert.equal(registry.size, 3, "this is the whole point of P0.3a: a season cannot grow it without bound");
  assert.equal(registry.has("cmd-1"), false, "oldest out first");
  assert.deepEqual(["cmd-2", "cmd-3", "cmd-4"].map(id => registry.has(id)), [true, true, true]);
  // Positive cache, same contract as `EventLedger.hasCommand()`: an evicted id is claimable again
  // here, and what stops a double-apply is the point query on `event_ledger_command_idx` inside the
  // command transaction. In in-memory mode the window is the guarantee, which is the trade the
  // ledger already makes.
  assert.equal(registry.claim("cmd-1"), true);
});

test("rollback forgets exactly what the failed command claimed", () => {
  const registry = new CommandRegistry(10);
  registry.claim("cmd-earlier");

  registry.begin();
  registry.claim("cmd-failing");
  registry.claim("cmd-failing-violate"); // one command can claim more than one id (derived ids)
  registry.rollback();

  assert.equal(registry.has("cmd-earlier"), true, "a previous command's claim is not this command's business");
  assert.equal(registry.claim("cmd-failing"), true, "a command that threw must be retryable with the same id");
  assert.equal(registry.claim("cmd-failing-violate"), true);
});

test("commit closes the journal, so a later rollback cannot reach back into it", () => {
  const registry = new CommandRegistry(10);
  registry.begin();
  registry.claim("cmd-committed");
  registry.commit();

  registry.begin();
  registry.claim("cmd-thrown");
  registry.rollback();

  assert.equal(registry.has("cmd-committed"), true, "committed work is not undone by the next command failing");
  assert.equal(registry.has("cmd-thrown"), false);
});

test("claims made outside a command transaction are permanent", () => {
  const registry = new CommandRegistry(10);
  // The tick claims derived ids when a pursuit order resolves or a treaty auto-breaks. There is no
  // transaction to roll back there, and there never was one to copy a Set for either.
  registry.claim("cmd-tick-violate");

  registry.begin();
  registry.rollback();

  assert.equal(registry.has("cmd-tick-violate"), true);
});

test("begin discards a journal left open by a command that already returned", () => {
  const registry = new CommandRegistry(10);
  registry.begin();
  registry.claim("cmd-orphaned");
  // No commit: transactions are serialized by `Store.runExclusive`, so reaching `begin()` again
  // means the previous command is done and its journal must not survive into this one.
  registry.begin();
  registry.rollback();

  assert.equal(registry.has("cmd-orphaned"), true);
});

test("clear drops every id and any open journal", () => {
  const registry = new CommandRegistry(10);
  registry.claim("cmd-last-season");
  registry.begin();
  registry.claim("cmd-in-flight");

  registry.clear();

  assert.equal(registry.size, 0);
  assert.equal(registry.has("cmd-last-season"), false);
  registry.rollback();
  assert.equal(registry.claim("cmd-in-flight"), true, "rollback after clear must not throw or resurrect state");
});
