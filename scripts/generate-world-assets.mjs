import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { terrainAt, worldAssetId, worldExtent } from "../packages/shared/dist/index.js";

globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(buffer => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(scriptDir, "../apps/client/public/assets/world3d", worldAssetId);
const cellSize = 6;
const worldSize = worldExtent * cellSize;

function heightAt(x, y) {
  const terrain = terrainAt(Math.round(x), Math.round(y));
  const ripple = Math.sin(x * 0.31) * 0.22 + Math.cos(y * 0.27) * 0.18;
  if (terrain === "hills") return 2.5 + ripple * 1.8;
  if (terrain === "forest") return 0.45 + ripple;
  if (terrain === "swamp") return -0.32 + ripple * 0.2;
  return ripple * 0.35;
}

const colors = {
  plains: new THREE.Color(0x477a45),
  forest: new THREE.Color(0x285c35),
  hills: new THREE.Color(0x77664a),
  swamp: new THREE.Color(0x365f5a),
};

function hash(x, y) {
  return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

function buildTerrain(segments, name) {
  const geometry = new THREE.PlaneGeometry(worldSize, worldSize, segments, segments);
  const positions = geometry.attributes.position;
  const vertexColors = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index += 1) {
    const gx = (positions.getX(index) / worldSize + 0.5) * (worldExtent - 1);
    // PlaneGeometry's Y becomes -Z after the Y-up rotation, so sample the
    // gameplay row in the opposite direction to keep tile (x,y) aligned.
    const gy = (-positions.getY(index) / worldSize + 0.5) * (worldExtent - 1);
    positions.setZ(index, heightAt(gx, gy));
    const terrain = terrainAt(Math.round(gx), Math.round(gy));
    const color = colors[terrain].clone().offsetHSL(0, 0, ((hash(Math.round(gx), Math.round(gy)) % 17) - 8) / 180);
    vertexColors[index * 3] = color.r;
    vertexColors[index * 3 + 1] = color.g;
    vertexColors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(vertexColors, 3));
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0.02 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const exporter = new GLTFExporter();
  for (const [name, segments] of [["terrain-lod0", 128], ["terrain-lod1", 32]]) {
    const binary = await new Promise((resolve, reject) => exporter.parse(buildTerrain(segments, `meridian_${name}`), resolve, reject, { binary: true, onlyVisible: false }));
    fs.writeFileSync(path.join(outputDir, `${name}.glb`), Buffer.from(binary));
    console.log(`Generated ${path.join(outputDir, `${name}.glb`)}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
