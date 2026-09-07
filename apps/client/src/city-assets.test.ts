import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CITY_ASSET_SET_ID, cityAssetManifest } from "./city-3d/manifest.js";

test("temporary city manifest contains local authored assets with an auditable index", () => {
  assert.equal(CITY_ASSET_SET_ID, "temp-kenney-v1");
  const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const publicRoot = path.join(clientRoot, "public");
  const urls = Object.values(cityAssetManifest);
  assert.ok(urls.length >= 40);
  assert.equal(new Set(urls).size, urls.length);
  for (const url of urls) {
    assert.match(url, /^\/assets\/city3d\/temp\/kenney-v1\/.+\.glb$/);
    assert.equal(fs.existsSync(path.join(publicRoot, url.replace(/^\//, ""))), true, `missing ${url}`);
  }
  assert.equal(fs.existsSync(path.join(publicRoot, "assets/city3d/temp/kenney-v1/asset-index.json")), true);
});
