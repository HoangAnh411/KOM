import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";
import test from "node:test";
import { gameRules } from "./index.js";
import { terrainRows, worldExtent } from "./world-map.js";

/** The width of the world used to be spelled out in eight places: the server's terrain
 * seed, its raider and world-event spawn windows, a dev mob-spawn endpoint, the logistics
 * grid, the client's hit test, the move-command validator, and two server tests. Nothing
 * tied them together, so resizing the map meant finding all eight and hoping.
 *
 * One of them mattered more than the rest: the zod bound on `moveArmyCommandSchema` would
 * have rejected every order past tile 19 on a wider board while the rest of the game
 * agreed the tile existed — a silent server-side "your army refuses to march east".
 *
 * `gameRules.map.extent` is now the only place that number lives, and this scan is what
 * keeps it that way. The failure mode of a re-introduced literal is not a crash; it is two
 * halves of the game disagreeing about where the edge of the world is. */

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skipDirectories = new Set(["node_modules", "dist", "build", "playwright-report", "test-results", "coverage"]);

const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return entry.name.startsWith(".") || skipDirectories.has(entry.name) ? [] : sourceFiles(path);
  return /\.tsx?$/.test(entry.name) ? [path] : [];
});

// Comments are stripped first, so a comment explaining the ban does not trip it.
const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

/** Three shapes the duplicate took, each kept narrow on purpose. Searching for the bare
 *  literal would be useless: `iron: 20`, `morale < 20` and a pagination `limit = 20` are
 *  all legitimate. Every pattern below instead names a place where a *tile coordinate*
 *  meets a hard-coded number, which is the only case that can disagree with the rules. */
const patterns: Array<[string, RegExp]> = [
  ["a second `mapExtent` holding a literal size", /\bmapExtent\s*=\s*[0-9]/],
  ["a tile coordinate compared against a hard-coded edge", /\b(tile\.)?(x|y|targetX|targetY)\s*(<=?|>=?)\s*[0-9]{2}\b/],
  ["a move-command bound that does not read the rules", /target[XY]:\s*z\.number\(\)[^,]*\.max\(\s*[0-9]+\s*\)/],
];

/** The one file allowed to write the number down, and this guard, whose sample strings
 *  are deliberately the very thing it bans. */
const home = join("packages", "shared", "src", "index.ts");
const exempt = new Set([home, join("packages", "shared", "src", "map-size.test.ts")]);

test("the map size is declared in exactly one place", () => {
  const files = sourceFiles(repoRoot);
  assert.ok(files.length > 40, `expected to scan the whole repo, found ${files.length} files`);
  const offenders: string[] = [];
  for (const file of files) {
    const relativePath = relative(repoRoot, file);
    if (exempt.has(relativePath)) continue;
    const lines = stripComments(readFileSync(file, "utf8")).split("\n");
    for (const [reason, pattern] of patterns) {
      const index = lines.findIndex(line => pattern.test(line));
      if (index >= 0) offenders.push(`${relativePath.split(sep).join("/")}:${index + 1} — ${reason}`);
    }
  }
  assert.deepEqual(offenders, [], "read `gameRules.map.extent` instead of restating the width of the world");
});

test("the guard is aimed at something that still exists, and it catches a new copy", () => {
  // Belt to the braces above: without this, renaming the constant would leave the scan
  // passing while it searched for a shape that no longer appears anywhere.
  assert.match(readFileSync(join(repoRoot, home), "utf8"), /\bconst mapExtent = worldExtent;/, "the sanctioned declaration moved or was renamed");
  // The number itself is not written there either: it is how many rows the authored map has,
  // so a map and a size that disagree is no longer a state the repo can be in.
  assert.equal(gameRules.map.extent, worldExtent);
  assert.equal(worldExtent, terrainRows.length);
  // And the placement window really is derived from it, not a second copy that agrees today.
  assert.equal(gameRules.cityPlacement.maxX, gameRules.map.extent - 1 - gameRules.map.placementMargin);
  assert.equal(gameRules.cityPlacement.minX, gameRules.map.placementMargin);

  const [redeclared, edgeBound, zodBound] = patterns.map(([, pattern]) => pattern);
  assert.ok(redeclared.test("const mapExtent = 20;"));
  assert.ok(edgeBound.test("target.x = city.x <= 16 ? city.x + 3 : city.x - 3;"));
  assert.ok(edgeBound.test("assert.ok(first.y < 20);"));
  assert.ok(zodBound.test("targetX: z.number().int().min(0).max(19)"));
  // Numbers that are not the edge of the world stay legal.
  assert.equal(redeclared.test("export const mapExtent = gameRules.map.extent;"), false);
  assert.equal(edgeBound.test("if (army.morale < 20) retreat();"), false);
  assert.equal(edgeBound.test("const limit = 20;"), false);
  assert.equal(edgeBound.test("if (raider.strength >= 30) hunt();"), false);
  assert.equal(edgeBound.test("const dx = 12; if (dx <= 20) step();"), false, "deltas are not coordinates");
  assert.equal(edgeBound.test("if (city.x <= 9) return;"), false, "single digits are ordinary map arithmetic");
});
