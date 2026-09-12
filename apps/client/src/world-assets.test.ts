import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("the 256 world ships an actual GLB terrain and a replaceable semantic manifest", () => {
  const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const worldRoot = path.join(clientRoot, "public/assets/world3d/meridian-256-v2");
  const manifest = JSON.parse(fs.readFileSync(path.join(worldRoot, "manifest.json"), "utf8")) as {
    id: string;
    extent: number;
    terrain: { lod0: string; lod1: string };
    replaceableBySemanticId: boolean;
  };
  assert.equal(manifest.id, "meridian-256-v2");
  assert.equal(manifest.extent, 256);
  assert.equal(manifest.replaceableBySemanticId, true);
  const terrain = path.join(clientRoot, "public", manifest.terrain.lod0.replace(/^\//, ""));
  const bytes = fs.readFileSync(terrain);
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "glTF");
  assert.ok(bytes.length > 100_000, "terrain is a real mesh asset, not a placeholder primitive");
  const lod1 = path.join(clientRoot, "public", manifest.terrain.lod1.replace(/^\//, ""));
  assert.equal(fs.readFileSync(lod1).subarray(0, 4).toString("ascii"), "glTF");
  assert.ok(fs.statSync(lod1).size < bytes.length, "the distant terrain LOD is actually lighter");
});
