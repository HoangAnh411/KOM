import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Polyfill FileReader for GLTFExporter in Node.js
globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(buf => {
      this.result = buf;
      if (this.onloadend) this.onloadend();
    });
  }
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "apps", "client", "public", "assets", "city", "models");
const tempDir = path.join(rootDir, "apps", "client", "public", "assets", "city", "_temp");

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(tempDir, { recursive: true });

// --- Color Palette & Materials ---
const matLimestone = new THREE.MeshStandardMaterial({ color: 0xdfd4be, roughness: 0.82, metalness: 0.05, name: "mat_limestone" });
const matFoundation = new THREE.MeshStandardMaterial({ color: 0x7a7266, roughness: 0.90, metalness: 0.05, name: "mat_foundation" });
const matTerracotta = new THREE.MeshStandardMaterial({ color: 0xb8441f, roughness: 0.65, metalness: 0.08, name: "mat_terracotta" });
const matTerracottaDark = new THREE.MeshStandardMaterial({ color: 0x8a3215, roughness: 0.70, metalness: 0.08, name: "mat_terracotta_dark" });
const matTurquoiseRoof = new THREE.MeshStandardMaterial({ color: 0x22787e, roughness: 0.45, metalness: 0.15, name: "mat_turquoise_roof" });
const matWoodTimber = new THREE.MeshStandardMaterial({ color: 0x583925, roughness: 0.75, metalness: 0.05, name: "mat_timber" });
const matWoodPlank = new THREE.MeshStandardMaterial({ color: 0x855835, roughness: 0.78, metalness: 0.04, name: "mat_wood_plank" });
const matBronze = new THREE.MeshStandardMaterial({ color: 0xb57c32, roughness: 0.35, metalness: 0.85, name: "mat_bronze" });
const matGold = new THREE.MeshStandardMaterial({ color: 0xd6b038, roughness: 0.28, metalness: 0.90, name: "mat_gold" });
const matIron = new THREE.MeshStandardMaterial({ color: 0x3d4349, roughness: 0.50, metalness: 0.80, name: "mat_iron" });
const matPlaster = new THREE.MeshStandardMaterial({ color: 0xf5efe4, roughness: 0.85, metalness: 0.02, name: "mat_plaster" });
const matLitWindow = new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0xffa726, emissiveIntensity: 0.8, roughness: 0.3, name: "mat_lit_window" });
const matBannerBlue = new THREE.MeshStandardMaterial({ color: 0x1a4b75, roughness: 0.70, metalness: 0.05, name: "mat_banner_blue" });
const matBannerRed = new THREE.MeshStandardMaterial({ color: 0x8e2424, roughness: 0.70, metalness: 0.05, name: "mat_banner_red" });
const matLeaves1 = new THREE.MeshStandardMaterial({ color: 0x387c2b, roughness: 0.75, metalness: 0.02, name: "mat_leaves_1" });
const matLeaves2 = new THREE.MeshStandardMaterial({ color: 0x215c2b, roughness: 0.80, metalness: 0.02, name: "mat_leaves_2" });
const matLeaves3 = new THREE.MeshStandardMaterial({ color: 0x5d8f36, roughness: 0.72, metalness: 0.02, name: "mat_leaves_3" });
const matSandPave = new THREE.MeshStandardMaterial({ color: 0xc8ba9e, roughness: 0.95, metalness: 0.01, name: "mat_sand_pave" });

// Helper Geometries
function createBox(w, h, d, mat, pos = [0, 0, 0], rot = [0, 0, 0], name = "") {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  if (name) mesh.name = name;
  return mesh;
}

function createCylinder(rt, rb, h, segs, mat, pos = [0, 0, 0], rot = [0, 0, 0], name = "") {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segs), mat);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  if (name) mesh.name = name;
  return mesh;
}

function createGableRoof(w, h, d, mat, pos = [0, 0, 0], rot = [0, 0, 0], name = "") {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geom = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  geom.center();
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  if (name) mesh.name = name;
  return mesh;
}

function createPyramidRoof(radius, h, mat, pos = [0, 0, 0], rot = [0, Math.PI / 4, 0], name = "") {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, h, 4), mat);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  if (name) mesh.name = name;
  return mesh;
}

function createDome(radius, mat, pos = [0, 0, 0], name = "") {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  mesh.position.set(...pos);
  if (name) mesh.name = name;
  return mesh;
}

function createTimberFrame(w, h, d, group) {
  const beamSize = 0.14;
  // 4 vertical corner posts
  const halfW = w / 2 - beamSize / 2;
  const halfD = d / 2 - beamSize / 2;
  group.add(createBox(beamSize, h, beamSize, matWoodTimber, [halfW, h / 2, halfD]));
  group.add(createBox(beamSize, h, beamSize, matWoodTimber, [-halfW, h / 2, halfD]));
  group.add(createBox(beamSize, h, beamSize, matWoodTimber, [halfW, h / 2, -halfD]));
  group.add(createBox(beamSize, h, beamSize, matWoodTimber, [-halfW, h / 2, -halfD]));
  // Top horizontal collar beams
  group.add(createBox(w, beamSize, beamSize, matWoodTimber, [0, h - beamSize / 2, halfD]));
  group.add(createBox(w, beamSize, beamSize, matWoodTimber, [0, h - beamSize / 2, -halfD]));
  group.add(createBox(beamSize, beamSize, d, matWoodTimber, [halfW, h - beamSize / 2, 0]));
  group.add(createBox(beamSize, beamSize, d, matWoodTimber, [-halfW, h - beamSize / 2, 0]));
}

// Export and optimize helper
async function exportAndOptimize(object, filename, animations = []) {
  const tempPath = path.join(tempDir, filename);
  const outPath = path.join(outDir, filename);

  const exporter = new GLTFExporter();
  await new Promise((resolve, reject) => {
    exporter.parse(
      object,
      gltf => {
        fs.writeFileSync(tempPath, Buffer.from(gltf));
        resolve();
      },
      err => reject(err),
      { binary: true, animations, onlyVisible: false }
    );
  });

  // Run meshopt via gltf-transform
  try {
    execSync(`npx gltf-transform meshopt "${tempPath}" "${outPath}"`, { stdio: "pipe" });
  } catch (err) {
    console.warn(`meshopt failed on ${filename}, falling back to raw export:`, err.message);
    fs.copyFileSync(tempPath, outPath);
  }

  const rawSize = fs.statSync(tempPath).size;
  const optSize = fs.statSync(outPath).size;
  fs.unlinkSync(tempPath);
  console.log(`✓ ${filename.padEnd(20)}: ${(rawSize / 1024).toFixed(1)} KiB -> ${(optSize / 1024).toFixed(1)} KiB`);
}

// ==========================================
// 1. TOWN HALL (3x3 footprint = 6.0 x 6.0)
// ==========================================
function buildTownHall() {
  const root = new THREE.Group();
  root.name = "town_hall";

  // Level 1: Manor house with rustic timber and stone base
  const l1 = new THREE.Group();
  l1.name = "visual_level_1";
  l1.add(createBox(5.2, 0.4, 5.2, matFoundation, [0, 0.2, 0]));
  l1.add(createBox(4.2, 2.0, 4.0, matPlaster, [0, 1.4, 0]));
  createTimberFrame(4.22, 2.0, 4.02, l1);
  // Gable roof
  l1.add(createGableRoof(4.8, 1.8, 4.4, matTerracotta, [0, 2.4 + 0.9, 0]));
  // Porch & Door
  l1.add(createBox(1.6, 1.6, 0.1, matWoodTimber, [0, 1.2, 2.02])); // Door
  l1.add(createCylinder(0.1, 0.1, 1.8, 8, matWoodTimber, [-0.9, 1.1, 2.5]));
  l1.add(createCylinder(0.1, 0.1, 1.8, 8, matWoodTimber, [0.9, 1.1, 2.5]));
  l1.add(createGableRoof(2.2, 0.6, 1.0, matTerracotta, [0, 2.1, 2.5]));
  // Windows
  l1.add(createBox(0.6, 0.6, 0.05, matLitWindow, [-1.4, 1.5, 2.02]));
  l1.add(createBox(0.6, 0.6, 0.05, matLitWindow, [1.4, 1.5, 2.02]));
  // Chimney
  l1.add(createBox(0.6, 2.8, 0.6, matFoundation, [1.5, 2.6, -1.2]));
  // Flag mast on ridge
  l1.add(createCylinder(0.04, 0.04, 1.4, 8, matWoodTimber, [0, 4.8, 0]));
  l1.add(createBox(0.8, 0.4, 0.02, matBannerBlue, [0.4, 5.2, 0]));
  root.add(l1);

  // Level 2: Two-storey civic council hall with clock/bell tower
  const l2 = new THREE.Group();
  l2.name = "visual_level_2";
  l2.add(createBox(5.4, 0.5, 5.4, matFoundation, [0, 0.25, 0]));
  l2.add(createBox(3.0, 0.25, 0.8, matLimestone, [0, 0.125, 2.8])); // Entry steps
  // Ground floor ashlar
  l2.add(createBox(4.4, 1.8, 4.2, matLimestone, [0, 1.4, 0]));
  // Second floor plaster/timber
  l2.add(createBox(4.5, 1.8, 4.3, matPlaster, [0, 3.2, 0]));
  createTimberFrame(4.52, 1.8, 4.32, l2);
  l2.children[l2.children.length - 1].position.y = 2.3;
  // Hipped roof
  l2.add(createPyramidRoof(3.6, 2.0, matTerracotta, [0, 4.1 + 1.0, 0]));
  // Central Bell/Clock Tower
  l2.add(createBox(1.6, 2.8, 1.6, matLimestone, [0, 4.8, 0]));
  l2.add(createPyramidRoof(1.4, 1.4, matTurquoiseRoof, [0, 6.2 + 0.7, 0]));
  l2.add(createCylinder(0.04, 0.04, 1.2, 8, matBronze, [0, 7.8, 0]));
  l2.add(createBox(0.9, 0.5, 0.02, matBannerBlue, [0.45, 8.0, 0]));
  // Stone portico
  l2.add(createCylinder(0.14, 0.16, 2.0, 8, matLimestone, [-1.2, 1.3, 2.3]));
  l2.add(createCylinder(0.14, 0.16, 2.0, 8, matLimestone, [1.2, 1.3, 2.3]));
  l2.add(createBox(3.0, 0.3, 0.8, matLimestone, [0, 2.4, 2.3]));
  l2.add(createBox(1.6, 1.8, 0.1, matWoodTimber, [0, 1.3, 2.12])); // Door
  // Windows
  for (const x of [-1.5, 0, 1.5]) {
    l2.add(createBox(0.6, 0.9, 0.05, matLitWindow, [x, 3.2, 2.18]));
  }
  root.add(l2);

  // Level 3: Monumental imperial capitol palace with classical colonnade and grand dome
  const l3 = new THREE.Group();
  l3.name = "visual_level_3";
  l3.add(createBox(5.6, 0.6, 5.6, matFoundation, [0, 0.3, 0]));
  // Grand marble stair
  l3.add(createBox(3.4, 0.3, 1.2, matLimestone, [0, 0.15, 2.9]));
  // Main palace body
  l3.add(createBox(4.8, 3.2, 4.6, matLimestone, [0, 2.2, 0]));
  // Colonnade Portico
  for (const x of [-1.6, -0.55, 0.55, 1.6]) {
    l3.add(createCylinder(0.14, 0.16, 3.0, 12, matLimestone, [x, 2.1, 2.5]));
  }
  // Pediment above portico
  l3.add(createBox(3.8, 0.4, 0.8, matLimestone, [0, 3.8, 2.4]));
  l3.add(createGableRoof(3.8, 1.2, 0.8, matLimestone, [0, 4.4, 2.4], [0, 0, 0]));
  l3.add(createCylinder(0.3, 0.3, 0.05, 12, matGold, [0, 4.3, 2.82], [Math.PI / 2, 0, 0])); // Gold crest medallion
  // Central Great Dome
  l3.add(createCylinder(1.7, 1.7, 0.8, 16, matLimestone, [0, 4.2, 0]));
  l3.add(createDome(1.65, matTurquoiseRoof, [0, 4.6, 0]));
  // Spire & Finial
  l3.add(createCylinder(0.2, 0.3, 0.6, 8, matGold, [0, 6.4, 0]));
  l3.add(createCylinder(0.04, 0.04, 1.8, 8, matGold, [0, 7.3, 0]));
  l3.add(createBox(1.2, 0.6, 0.02, matBannerBlue, [0.6, 7.8, 0]));
  // Side balustrades and bronze urns
  for (const [bx, bz] of [[-2.0, -1.8], [2.0, -1.8], [-2.0, 1.8], [2.0, 1.8]]) {
    l3.add(createBox(0.4, 0.6, 0.4, matLimestone, [bx, 4.1, bz]));
    l3.add(createCylinder(0.18, 0.12, 0.4, 8, matBronze, [bx, 4.6, bz]));
  }
  // Grand Bronze Gate
  l3.add(createBox(1.8, 2.4, 0.1, matBronze, [0, 1.8, 2.32]));
  root.add(l3);

  // Default visibility
  l1.visible = true;
  l2.visible = false;
  l3.visible = false;

  // Collider & Door
  const collider = createBox(5.4, 6.0, 5.4, matFoundation, [0, 3.0, 0], [0, 0, 0], "collider");
  collider.visible = false;
  root.add(collider);

  const door = new THREE.Object3D();
  door.name = "door";
  door.position.set(0, 0, 2.8);
  root.add(door);

  return root;
}

// ==========================================
// 2. WAREHOUSE (2x2 footprint = 4.0 x 4.0)
// ==========================================
function buildWarehouse() {
  const root = new THREE.Group();
  root.name = "warehouse";

  // Level 1: Wooden storehouse with loading platform & crates
  const l1 = new THREE.Group();
  l1.name = "visual_level_1";
  l1.add(createBox(3.4, 0.3, 3.4, matFoundation, [0, 0.15, 0]));
  l1.add(createBox(2.8, 1.8, 2.8, matWoodPlank, [0, 1.2, 0]));
  createTimberFrame(2.82, 1.8, 2.82, l1);
  // Pitched roof
  l1.add(createGableRoof(3.2, 1.2, 3.0, matTerracottaDark, [0, 2.1 + 0.6, 0]));
  // Barn Door
  l1.add(createBox(1.4, 1.4, 0.08, matWoodTimber, [0, 1.0, 1.42]));
  // Side lean-to canopy with crates
  l1.add(createBox(0.8, 0.1, 1.8, matWoodTimber, [1.6, 1.4, 0], [0, 0, -0.3]));
  l1.add(createBox(0.4, 0.4, 0.4, matWoodTimber, [1.5, 0.5, -0.4]));
  l1.add(createBox(0.35, 0.35, 0.35, matWoodPlank, [1.5, 0.47, 0.2]));
  l1.add(createBox(0.3, 0.3, 0.3, matWoodPlank, [1.5, 0.85, -0.35]));
  root.add(l1);

  // Level 2: Stone masonry warehouse with roof hoist crane and cargo bay
  const l2 = new THREE.Group();
  l2.name = "visual_level_2";
  l2.add(createBox(3.6, 0.4, 3.6, matFoundation, [0, 0.2, 0]));
  l2.add(createBox(3.0, 1.6, 3.0, matLimestone, [0, 1.2, 0]));
  l2.add(createBox(3.1, 1.2, 3.1, matPlaster, [0, 2.6, 0]));
  createTimberFrame(3.12, 1.2, 3.12, l2);
  l2.children[l2.children.length - 1].position.y = 2.0;
  // Hipped terracotta roof
  l2.add(createPyramidRoof(2.8, 1.6, matTerracotta, [0, 3.2 + 0.8, 0]));
  // Hoist Crane Arm extending from loft
  l2.add(createBox(0.12, 0.12, 1.2, matWoodTimber, [0, 3.4, 1.8]));
  l2.add(createCylinder(0.015, 0.015, 0.8, 6, matIron, [0, 2.9, 2.3])); // Hoist rope
  l2.add(createCylinder(0.08, 0.08, 0.15, 8, matIron, [0, 2.45, 2.3])); // Hook/weight
  // Loading ramp & Iron-banded doors
  l2.add(createBox(1.6, 0.2, 0.8, matWoodPlank, [0, 0.2, 1.8], [-0.15, 0, 0]));
  l2.add(createBox(1.6, 1.6, 0.1, matWoodTimber, [0, 1.1, 1.52]));
  l2.add(createBox(1.6, 0.06, 0.12, matIron, [0, 1.4, 1.52])); // Iron strap
  // Stacked barrels & crates
  l2.add(createCylinder(0.25, 0.22, 0.6, 10, matWoodTimber, [-1.2, 0.7, 1.2]));
  l2.add(createCylinder(0.25, 0.22, 0.6, 10, matWoodTimber, [-1.2, 0.7, 0.6]));
  l2.add(createBox(0.45, 0.45, 0.45, matWoodPlank, [1.2, 0.62, 1.1]));
  root.add(l2);

  // Level 3: Fortified royal granary & vault with buttresses and iron-grated bays
  const l3 = new THREE.Group();
  l3.name = "visual_level_3";
  l3.add(createBox(3.8, 0.5, 3.8, matFoundation, [0, 0.25, 0]));
  // Main ashlar structure
  l3.add(createBox(3.2, 2.8, 3.2, matLimestone, [0, 1.9, 0]));
  // Corner buttresses
  for (const [bx, bz] of [[-1.65, -1.65], [1.65, -1.65], [-1.65, 1.65], [1.65, 1.65]]) {
    l3.add(createBox(0.5, 2.8, 0.5, matFoundation, [bx, 1.8, bz]));
  }
  // Barrel-vaulted turquoise roof
  l3.add(createCylinder(1.6, 1.6, 3.4, 16, matTurquoiseRoof, [0, 3.3, 0], [Math.PI / 2, 0, 0]));
  l3.add(createBox(3.4, 0.15, 0.2, matBronze, [0, 3.3, 1.7])); // Bronze ridge trim
  // Double iron portcullis cargo bays
  l3.add(createBox(1.1, 1.8, 0.1, matIron, [-0.7, 1.2, 1.62]));
  l3.add(createBox(1.1, 1.8, 0.1, matIron, [0.7, 1.2, 1.62]));
  // Heavy machinery hoist on projecting stone corbel
  l3.add(createBox(0.3, 0.3, 1.0, matLimestone, [0, 3.1, 1.9]));
  l3.add(createCylinder(0.2, 0.2, 0.08, 12, matBronze, [0, 3.1, 2.3], [0, 0, Math.PI / 2])); // Gear
  // Treasure chests and amphorae
  l3.add(createBox(0.6, 0.4, 0.4, matWoodTimber, [-1.2, 0.7, 1.2]));
  l3.add(createBox(0.62, 0.06, 0.42, matBronze, [-1.2, 0.75, 1.2])); // Gold band
  l3.add(createCylinder(0.18, 0.1, 0.7, 10, matTerracotta, [1.2, 0.85, 1.2])); // Amphora
  root.add(l3);

  l1.visible = true;
  l2.visible = false;
  l3.visible = false;

  const collider = createBox(3.6, 4.0, 3.6, matFoundation, [0, 2.0, 0], [0, 0, 0], "collider");
  collider.visible = false;
  root.add(collider);

  const door = new THREE.Object3D();
  door.name = "door";
  door.position.set(0, 0, 1.8);
  root.add(door);

  return root;
}

// ==========================================
// 3. ROAD DEPOT (3x2 footprint = 6.0 x 4.0)
// ==========================================
function buildRoadDepot() {
  const root = new THREE.Group();
  root.name = "road_depot";

  // Level 1: Waystation shelter with hitching rail, hay bales & simple cart
  const l1 = new THREE.Group();
  l1.name = "visual_level_1";
  l1.add(createBox(5.4, 0.15, 3.4, matSandPave, [0, 0.075, 0]));
  // Open timber shelter on left
  l1.add(createBox(2.4, 1.8, 1.8, matPlaster, [-1.2, 1.0, -0.4]));
  l1.add(createGableRoof(2.8, 0.9, 2.2, matTerracottaDark, [-1.2, 1.9 + 0.45, -0.4]));
  l1.add(createBox(0.8, 1.4, 0.05, matWoodTimber, [-1.2, 0.8, 0.52])); // Office door
  // Hitching post rail
  l1.add(createCylinder(0.06, 0.06, 0.9, 8, matWoodTimber, [0.8, 0.5, 1.0]));
  l1.add(createCylinder(0.06, 0.06, 0.9, 8, matWoodTimber, [2.0, 0.5, 1.0]));
  l1.add(createBox(1.4, 0.08, 0.08, matWoodTimber, [1.4, 0.8, 1.0]));
  // 2-wheel wooden cart on right
  const cart = new THREE.Group();
  cart.position.set(1.4, 0.4, -0.4);
  cart.add(createBox(1.4, 0.4, 0.8, matWoodPlank, [0, 0.2, 0]));
  cart.add(createCylinder(0.35, 0.35, 0.08, 12, matWoodTimber, [0, 0, 0.45], [Math.PI / 2, 0, 0]));
  cart.add(createCylinder(0.35, 0.35, 0.08, 12, matWoodTimber, [0, 0, -0.45], [Math.PI / 2, 0, 0]));
  cart.add(createBox(1.0, 0.08, 0.08, matWoodTimber, [-1.0, 0.1, 0.2])); // Shaft
  cart.add(createBox(1.0, 0.08, 0.08, matWoodTimber, [-1.0, 0.1, -0.2]));
  l1.add(cart);
  root.add(l1);

  // Level 2: Dispatch office, stable stalls & covered 4-wheel supply wagon
  const l2 = new THREE.Group();
  l2.name = "visual_level_2";
  l2.add(createBox(5.6, 0.3, 3.6, matFoundation, [0, 0.15, 0]));
  // Paved cobblestone yard
  l2.add(createBox(5.4, 0.05, 3.4, matSandPave, [0, 0.325, 0]));
  // Dispatch office building
  l2.add(createBox(2.4, 2.2, 2.2, matLimestone, [-1.3, 1.4, -0.4]));
  l2.add(createPyramidRoof(2.2, 1.4, matTerracotta, [-1.3, 2.5 + 0.7, -0.4]));
  l2.add(createBox(0.8, 1.6, 0.05, matWoodTimber, [-1.3, 1.1, 0.72]));
  l2.add(createBox(0.5, 0.5, 0.05, matLitWindow, [-0.5, 1.5, 0.72]));
  // Covered wagon bay
  l2.add(createCylinder(0.1, 0.1, 2.0, 8, matWoodTimber, [0.5, 1.3, 0.8]));
  l2.add(createCylinder(0.1, 0.1, 2.0, 8, matWoodTimber, [2.3, 1.3, 0.8]));
  l2.add(createCylinder(0.1, 0.1, 2.0, 8, matWoodTimber, [0.5, 1.3, -1.2]));
  l2.add(createCylinder(0.1, 0.1, 2.0, 8, matWoodTimber, [2.3, 1.3, -1.2]));
  l2.add(createGableRoof(2.4, 0.8, 2.4, matTerracotta, [1.4, 2.3 + 0.4, -0.2]));
  // Covered 4-wheel supply wagon
  const wagon = new THREE.Group();
  wagon.position.set(1.4, 0.45, -0.2);
  wagon.add(createBox(1.6, 0.4, 0.9, matWoodPlank, [0, 0.2, 0]));
  wagon.add(createCylinder(0.6, 0.6, 1.6, 12, matPlaster, [0, 0.7, 0], [0, 0, Math.PI / 2])); // Canvas
  for (const [wx, wz] of [[-0.6, 0.52], [0.6, 0.52], [-0.6, -0.52], [0.6, -0.52]]) {
    wagon.add(createCylinder(0.3, 0.3, 0.08, 12, matWoodTimber, [wx, 0, wz], [Math.PI / 2, 0, 0]));
  }
  l2.add(wagon);
  // Water trough with pump
  l2.add(createBox(0.6, 0.4, 1.2, matFoundation, [-1.3, 0.5, 1.2]));
  root.add(l2);

  // Level 3: Imperial caravan transit hub with stone colonnade, courier tower & freight bays
  const l3 = new THREE.Group();
  l3.name = "visual_level_3";
  l3.add(createBox(5.6, 0.4, 3.6, matFoundation, [0, 0.2, 0]));
  // Dispatch Bureau with Courier Tower
  l3.add(createBox(2.4, 2.8, 2.4, matLimestone, [-1.4, 1.6, -0.3]));
  l3.add(createPyramidRoof(2.2, 1.4, matTurquoiseRoof, [-1.4, 3.0 + 0.7, -0.3]));
  // Octagonal Courier Dovecote Tower
  l3.add(createCylinder(0.7, 0.7, 2.2, 8, matLimestone, [-1.4, 4.4, -0.3]));
  l3.add(createConeFinial(0.8, 1.0, matGold, [-1.4, 5.5 + 0.5, -0.3]));
  // Arched Colonnade Bay
  for (const x of [0.4, 1.4, 2.4]) {
    l3.add(createCylinder(0.14, 0.16, 2.6, 10, matLimestone, [x, 1.5, 0.8]));
    l3.add(createCylinder(0.14, 0.16, 2.6, 10, matLimestone, [x, 1.5, -1.2]));
  }
  l3.add(createBox(2.4, 0.4, 2.4, matLimestone, [1.4, 2.9, -0.2]));
  l3.add(createPyramidRoof(2.4, 1.2, matTurquoiseRoof, [1.4, 3.1 + 0.6, -0.2]));
  // Heavy Imperial Freight Wagon with bronze heraldry
  const impWagon = new THREE.Group();
  impWagon.position.set(1.4, 0.5, -0.2);
  impWagon.add(createBox(1.8, 0.5, 1.0, matWoodTimber, [0, 0.25, 0]));
  impWagon.add(createBox(1.82, 0.08, 1.02, matBronze, [0, 0.4, 0])); // Bronze rim
  impWagon.add(createCylinder(0.7, 0.7, 1.8, 12, matBannerBlue, [0, 0.85, 0], [0, 0, Math.PI / 2]));
  for (const [wx, wz] of [[-0.7, 0.6], [0.7, 0.6], [-0.7, -0.6], [0.7, -0.6]]) {
    impWagon.add(createCylinder(0.35, 0.35, 0.08, 12, matBronze, [wx, 0, wz], [Math.PI / 2, 0, 0]));
  }
  l3.add(impWagon);
  root.add(l3);

  l1.visible = true;
  l2.visible = false;
  l3.visible = false;

  const collider = createBox(5.6, 3.8, 3.6, matFoundation, [0, 1.9, 0], [0, 0, 0], "collider");
  collider.visible = false;
  root.add(collider);

  const door = new THREE.Object3D();
  door.name = "door";
  door.position.set(-1.2, 0, 1.6);
  root.add(door);

  return root;
}

function createConeFinial(radius, height, mat, pos) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 8), mat);
  mesh.position.set(...pos);
  return mesh;
}

// ==========================================
// 4. BARRACKS (3x3 footprint = 6.0 x 6.0)
// ==========================================
function buildBarracks() {
  const root = new THREE.Group();
  root.name = "barracks";

  // Level 1: Log quarters & training yard with dummies & fire pit
  const l1 = new THREE.Group();
  l1.name = "visual_level_1";
  l1.add(createBox(5.2, 0.15, 5.2, matSandPave, [0, 0.075, 0]));
  // Wooden log bunkhouse at back
  l1.add(createBox(4.4, 1.8, 2.0, matWoodTimber, [0, 1.0, -1.4]));
  l1.add(createGableRoof(4.8, 1.0, 2.4, matTerracottaDark, [0, 1.9 + 0.5, -1.4]));
  l1.add(createBox(1.0, 1.4, 0.05, matWoodPlank, [0, 0.8, -0.38])); // Door
  // Training yard features
  // Weapon rack
  const rack = new THREE.Group();
  rack.position.set(-1.6, 0.5, 1.2);
  rack.add(createBox(0.8, 0.8, 0.15, matWoodTimber, [0, 0, 0]));
  rack.add(createBox(0.06, 0.9, 0.02, matIron, [-0.2, 0, 0.1])); // Swords
  rack.add(createBox(0.06, 0.9, 0.02, matIron, [0.0, 0, 0.1]));
  rack.add(createBox(0.06, 0.9, 0.02, matIron, [0.2, 0, 0.1]));
  l1.add(rack);
  // Practice dummy
  const dummy = new THREE.Group();
  dummy.position.set(0.2, 0, 1.4);
  dummy.add(createCylinder(0.06, 0.06, 1.4, 8, matWoodTimber, [0, 0.7, 0]));
  dummy.add(createBox(0.8, 0.12, 0.12, matWoodTimber, [0, 1.0, 0])); // Crossbar
  dummy.add(createCylinder(0.18, 0.18, 0.6, 8, matSandPave, [0, 0.9, 0])); // Straw torso
  dummy.add(createCylinder(0.12, 0.12, 0.25, 8, matSandPave, [0, 1.3, 0])); // Head
  l1.add(dummy);
  // Straw archery target
  l1.add(createCylinder(0.4, 0.4, 0.15, 12, matSandPave, [1.8, 0.8, 1.2], [Math.PI / 2, 0, 0]));
  l1.add(createCylinder(0.05, 0.05, 1.2, 6, matWoodTimber, [1.8, 0.5, 1.0], [0.2, 0, 0]));
  root.add(l1);

  // Level 2: Fortified barracks hall, combat arena & watch platform
  const l2 = new THREE.Group();
  l2.name = "visual_level_2";
  l2.add(createBox(5.4, 0.3, 5.4, matFoundation, [0, 0.15, 0]));
  // Main stone barracks hall
  l2.add(createBox(4.6, 2.2, 2.2, matLimestone, [0, 1.4, -1.3]));
  l2.add(createGableRoof(5.0, 1.4, 2.6, matTerracotta, [0, 2.5 + 0.7, -1.3]));
  l2.add(createBox(1.2, 1.8, 0.06, matWoodTimber, [0, 1.2, -0.18]));
  // Windows
  for (const x of [-1.5, 1.5]) {
    l2.add(createBox(0.6, 0.8, 0.05, matLitWindow, [x, 1.6, -0.18]));
  }
  // Combat arena ring (fenced circular/hexagonal area)
  l2.add(createCylinder(1.4, 1.4, 0.1, 16, matSandPave, [-0.8, 0.35, 1.2]));
  // Wooden watchtower on corner
  const tower = new THREE.Group();
  tower.position.set(2.0, 0, 1.6);
  for (const [tx, tz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
    tower.add(createCylinder(0.08, 0.08, 3.4, 8, matWoodTimber, [tx, 1.7, tz]));
  }
  tower.add(createBox(1.2, 0.1, 1.2, matWoodPlank, [0, 3.0, 0]));
  tower.add(createPyramidRoof(1.1, 0.9, matTerracotta, [0, 3.7, 0]));
  tower.add(createCylinder(0.03, 0.03, 1.0, 8, matWoodTimber, [0, 4.4, 0]));
  tower.add(createBox(0.7, 0.35, 0.02, matBannerRed, [0.35, 4.6, 0]));
  l2.add(tower);
  root.add(l2);

  // Level 3: Citadel fortress academy with battlements, portcullis gatehouse & command tower
  const l3 = new THREE.Group();
  l3.name = "visual_level_3";
  l3.add(createBox(5.6, 0.5, 5.6, matFoundation, [0, 0.25, 0]));
  // Massive stone fortress back hall
  l3.add(createBox(5.0, 3.4, 2.4, matLimestone, [0, 2.2, -1.3]));
  // Parapet merlons on fortress roof
  for (let x = -2.2; x <= 2.2; x += 0.8) {
    l3.add(createBox(0.45, 0.6, 0.2, matLimestone, [x, 4.2, -0.05]));
  }
  // Central Command Tower rising high
  l3.add(createBox(2.2, 5.2, 2.2, matLimestone, [0, 3.1, -1.3]));
  // Parapets on tower
  l3.add(createBox(2.5, 0.6, 2.5, matLimestone, [0, 5.8, -1.3]));
  l3.add(createCylinder(0.05, 0.05, 1.8, 8, matGold, [0, 6.7, -1.3]));
  l3.add(createBox(1.2, 0.6, 0.02, matBannerRed, [0.6, 7.1, -1.3]));
  // Front gatehouse with twin bastion turrets
  l3.add(createCylinder(0.6, 0.7, 2.6, 12, matLimestone, [-1.8, 1.6, 1.6]));
  l3.add(createCylinder(0.6, 0.7, 2.6, 12, matLimestone, [1.8, 1.6, 1.6]));
  l3.add(createConeFinial(0.75, 1.0, matTurquoiseRoof, [-1.8, 3.4, 1.6]));
  l3.add(createConeFinial(0.75, 1.0, matTurquoiseRoof, [1.8, 3.4, 1.6]));
  // Heavy gate and iron portcullis
  l3.add(createBox(1.6, 2.2, 0.1, matIron, [0, 1.4, 1.6]));
  // Courtyard weapon stands with golden shields
  l3.add(createCylinder(0.3, 0.3, 0.05, 12, matGold, [-0.8, 1.0, 0.3], [Math.PI / 2, 0, 0]));
  l3.add(createCylinder(0.3, 0.3, 0.05, 12, matGold, [0.8, 1.0, 0.3], [Math.PI / 2, 0, 0]));
  root.add(l3);

  l1.visible = true;
  l2.visible = false;
  l3.visible = false;

  const collider = createBox(5.6, 5.4, 5.6, matFoundation, [0, 2.7, 0], [0, 0, 0], "collider");
  collider.visible = false;
  root.add(collider);

  const door = new THREE.Object3D();
  door.name = "door";
  door.position.set(0, 0, 2.7);
  root.add(door);

  return root;
}

// ==========================================
// 5. ENVIRONMENT: WALLS & WATCHTOWER
// ==========================================
function buildWallStraight() {
  const root = new THREE.Group();
  root.name = "wall_straight";
  // 1 tile length = 2.0 width (X), 0.6 depth (Z), 1.6 height (Y)
  root.add(createBox(2.0, 0.3, 0.8, matFoundation, [0, 0.15, 0]));
  root.add(createBox(2.0, 1.2, 0.6, matLimestone, [0, 0.9, 0]));
  // Walkway slab
  root.add(createBox(2.0, 0.15, 0.7, matLimestone, [0, 1.575, 0]));
  // Crenellations on outer (+Z) face
  root.add(createBox(0.6, 0.4, 0.15, matLimestone, [-0.5, 1.85, 0.275]));
  root.add(createBox(0.6, 0.4, 0.15, matLimestone, [0.5, 1.85, 0.275]));
  return root;
}

function buildWallCorner() {
  const root = new THREE.Group();
  root.name = "wall_corner";
  // Corner pillar covering 0.8 x 0.8, connecting -X and -Z walls
  root.add(createBox(0.9, 0.35, 0.9, matFoundation, [0, 0.175, 0]));
  root.add(createBox(0.8, 1.5, 0.8, matLimestone, [0, 1.05, 0]));
  // Upper corbels and parapet
  root.add(createBox(1.0, 0.2, 1.0, matLimestone, [0, 1.85, 0]));
  root.add(createBox(0.3, 0.4, 0.15, matLimestone, [0.35, 2.1, 0.4]));
  root.add(createBox(0.15, 0.4, 0.3, matLimestone, [0.4, 2.1, 0.35]));
  // Connectors
  root.add(createBox(0.6, 1.2, 0.6, matLimestone, [-0.7, 0.9, 0]));
  root.add(createBox(0.6, 1.2, 0.6, matLimestone, [0, 0.9, -0.7]));
  return root;
}

function buildWallGate() {
  const root = new THREE.Group();
  root.name = "wall_gate";
  root.add(createBox(2.0, 0.3, 0.9, matFoundation, [0, 0.15, 0]));
  // Left and right stone arch piers
  root.add(createBox(0.5, 1.8, 0.7, matLimestone, [-0.75, 1.2, 0]));
  root.add(createBox(0.5, 1.8, 0.7, matLimestone, [0.75, 1.2, 0]));
  // Arch header
  root.add(createBox(2.0, 0.5, 0.8, matLimestone, [0, 2.35, 0]));
  // Walkway parapet with crenels
  root.add(createBox(0.5, 0.4, 0.15, matLimestone, [-0.7, 2.8, 0.35]));
  root.add(createBox(0.5, 0.4, 0.15, matLimestone, [0.7, 2.8, 0.35]));
  // Heavy wooden double gate
  root.add(createBox(0.48, 1.7, 0.08, matWoodTimber, [-0.25, 1.15, 0]));
  root.add(createBox(0.48, 1.7, 0.08, matWoodTimber, [0.25, 1.15, 0]));
  // Iron bands
  root.add(createBox(1.0, 0.06, 0.1, matIron, [0, 0.6, 0]));
  root.add(createBox(1.0, 0.06, 0.1, matIron, [0, 1.6, 0]));
  return root;
}

function buildWallTower() {
  const root = new THREE.Group();
  root.name = "wall_tower";
  // Watchtower footprint 1.4 x 1.4, height 3.8
  root.add(createBox(1.4, 0.4, 1.4, matFoundation, [0, 0.2, 0]));
  root.add(createBox(1.1, 2.4, 1.1, matLimestone, [0, 1.6, 0]));
  // Observation balcony
  root.add(createBox(1.4, 0.25, 1.4, matLimestone, [0, 2.9, 0]));
  // Corner posts for roof
  for (const [px, pz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
    root.add(createCylinder(0.06, 0.06, 0.8, 8, matWoodTimber, [px, 3.4, pz]));
  }
  // Parapet balustrade
  root.add(createBox(1.4, 0.3, 0.08, matLimestone, [0, 3.15, 0.66]));
  root.add(createBox(1.4, 0.3, 0.08, matLimestone, [0, 3.15, -0.66]));
  root.add(createBox(0.08, 0.3, 1.4, matLimestone, [0.66, 3.15, 0]));
  root.add(createBox(0.08, 0.3, 1.4, matLimestone, [-0.66, 3.15, 0]));
  // Pyramidal roof
  root.add(createPyramidRoof(1.3, 1.1, matTerracotta, [0, 3.8 + 0.55, 0]));
  root.add(createCylinder(0.03, 0.03, 0.5, 8, matBronze, [0, 4.7, 0]));
  return root;
}

// ==========================================
// 6. PROPS (Trees, Bush, Lamp, Crates, Cart, Scaffold)
// ==========================================
function buildProps() {
  const root = new THREE.Group();
  root.name = "props";

  // Tree 1: Broadleaf / Oak
  const t1 = new THREE.Group();
  t1.name = "tree_1";
  t1.add(createCylinder(0.12, 0.22, 1.6, 8, matWoodTimber, [0, 0.8, 0]));
  t1.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.85), matLeaves1)).position.set(0, 2.1, 0);
  t1.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.65), matLeaves1)).position.set(0.35, 1.7, 0.2);
  t1.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.6), matLeaves2)).position.set(-0.35, 1.8, -0.2);
  root.add(t1);

  // Tree 2: Conical Cypress / Pine
  const t2 = new THREE.Group();
  t2.name = "tree_2";
  t2.position.set(3, 0, 0);
  t2.add(createCylinder(0.1, 0.18, 1.4, 8, matWoodTimber, [0, 0.7, 0]));
  t2.add(new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.2, 7), matLeaves2)).position.set(0, 1.7, 0);
  t2.add(new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.1, 7), matLeaves2)).position.set(0, 2.4, 0);
  t2.add(new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.0, 7), matLeaves2)).position.set(0, 3.0, 0);
  root.add(t2);

  // Tree 3: Orchard / Fruit Tree
  const t3 = new THREE.Group();
  t3.name = "tree_3";
  t3.position.set(6, 0, 0);
  t3.add(createCylinder(0.1, 0.16, 1.2, 8, matWoodTimber, [0, 0.6, 0]));
  t3.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.7), matLeaves3)).position.set(0, 1.6, 0);
  // Small fruit orbs
  for (const [fx, fy, fz] of [[0.3, 1.6, 0.4], [-0.4, 1.4, 0.3], [0.2, 1.8, -0.4], [-0.2, 1.5, -0.4]]) {
    t3.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), matTerracotta)).position.set(fx, fy, fz);
  }
  root.add(t3);

  // Bush
  const bush = new THREE.Group();
  bush.name = "bush";
  bush.position.set(9, 0, 0);
  bush.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.4), matLeaves1)).position.set(0, 0.3, 0);
  bush.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.32), matLeaves2)).position.set(0.25, 0.25, 0.1);
  bush.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.3), matLeaves3)).position.set(-0.25, 0.22, -0.1);
  root.add(bush);

  // Streetlamp
  const lamp = new THREE.Group();
  lamp.name = "streetlamp";
  lamp.position.set(12, 0, 0);
  lamp.add(createBox(0.25, 0.3, 0.25, matFoundation, [0, 0.15, 0]));
  lamp.add(createCylinder(0.04, 0.06, 1.4, 8, matIron, [0, 1.0, 0]));
  lamp.add(createBox(0.22, 0.3, 0.22, matIron, [0, 1.8, 0]));
  lamp.add(createBox(0.16, 0.22, 0.16, matLitWindow, [0, 1.8, 0])); // Glowing lantern
  lamp.add(createPyramidRoof(0.2, 0.15, matIron, [0, 2.05, 0]));
  root.add(lamp);

  // Stack of 3 crates
  const crates = new THREE.Group();
  crates.name = "crates";
  crates.position.set(15, 0, 0);
  crates.add(createBox(0.5, 0.5, 0.5, matWoodPlank, [0, 0.25, 0]));
  crates.add(createBox(0.45, 0.45, 0.45, matWoodTimber, [0.55, 0.225, 0.05]));
  crates.add(createBox(0.42, 0.42, 0.42, matWoodPlank, [0.15, 0.71, 0.02]));
  root.add(crates);

  // Trade Cart
  const cart = new THREE.Group();
  cart.name = "cart";
  cart.position.set(18, 0, 0);
  cart.add(createBox(1.2, 0.35, 0.75, matWoodPlank, [0, 0.45, 0]));
  cart.add(createCylinder(0.35, 0.35, 0.08, 12, matWoodTimber, [0, 0.35, 0.45], [Math.PI / 2, 0, 0]));
  cart.add(createCylinder(0.35, 0.35, 0.08, 12, matWoodTimber, [0, 0.35, -0.45], [Math.PI / 2, 0, 0]));
  cart.add(createBox(0.9, 0.06, 0.06, matWoodTimber, [-0.9, 0.3, 0.2]));
  cart.add(createBox(0.9, 0.06, 0.06, matWoodTimber, [-0.9, 0.3, -0.2]));
  root.add(cart);

  // Construction Scaffolding Frame
  const scaffold = new THREE.Group();
  scaffold.name = "scaffold";
  scaffold.position.set(21, 0, 0);
  // 4 vertical timber poles
  for (const [sx, sz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
    scaffold.add(createCylinder(0.06, 0.06, 2.6, 6, matWoodTimber, [sx, 1.3, sz]));
  }
  // Cross braces & planks
  scaffold.add(createBox(1.7, 0.06, 0.06, matWoodTimber, [0, 1.2, 0.8]));
  scaffold.add(createBox(1.7, 0.06, 0.06, matWoodTimber, [0, 1.2, -0.8]));
  scaffold.add(createBox(0.06, 0.06, 1.7, matWoodTimber, [0.8, 1.2, 0]));
  scaffold.add(createBox(0.06, 0.06, 1.7, matWoodTimber, [-0.8, 1.2, 0]));
  scaffold.add(createBox(1.8, 0.06, 0.8, matWoodPlank, [0, 1.25, 0])); // Platform plank
  scaffold.add(createBox(1.8, 0.06, 0.8, matWoodPlank, [0, 2.3, 0]));
  root.add(scaffold);

  return root;
}

// ==========================================
// 7. CITIZEN (with Walk Animation)
// ==========================================
function buildCitizen() {
  const root = new THREE.Group();
  root.name = "citizen";

  const pelvis = new THREE.Group();
  pelvis.name = "pelvis";
  pelvis.position.set(0, 0.45, 0);
  root.add(pelvis);

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.18), matBannerBlue);
  torso.name = "torso";
  torso.position.set(0, 0.22, 0);
  pelvis.add(torso);

  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), matLimestone);
  head.name = "head";
  head.position.set(0, 0.26, 0);
  torso.add(head);

  // Hair / Cap
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.2), matWoodTimber);
  cap.position.set(0, 0.1, 0);
  head.add(cap);

  // Left Arm (pivot at shoulder)
  const armLeft = new THREE.Group();
  armLeft.name = "arm_left";
  armLeft.position.set(-0.18, 0.12, 0);
  const armLeftMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), matBannerBlue);
  armLeftMesh.position.set(0, -0.12, 0);
  armLeft.add(armLeftMesh);
  torso.add(armLeft);

  // Right Arm (pivot at shoulder)
  const armRight = new THREE.Group();
  armRight.name = "arm_right";
  armRight.position.set(0.18, 0.12, 0);
  const armRightMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), matBannerBlue);
  armRightMesh.position.set(0, -0.12, 0);
  armRight.add(armRightMesh);
  torso.add(armRight);

  // Left Leg (pivot at hip)
  const legLeft = new THREE.Group();
  legLeft.name = "leg_left";
  legLeft.position.set(-0.08, 0, 0);
  const legLeftMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), matWoodTimber);
  legLeftMesh.position.set(0, -0.21, 0);
  legLeft.add(legLeftMesh);
  pelvis.add(legLeft);

  // Right Leg (pivot at hip)
  const legRight = new THREE.Group();
  legRight.name = "leg_right";
  legRight.position.set(0.08, 0, 0);
  const legRightMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), matWoodTimber);
  legRightMesh.position.set(0, -0.21, 0);
  legRight.add(legRightMesh);
  pelvis.add(legRight);

  // --- Walk Animation Keyframes (1.0s loop) ---
  const times = [0, 0.25, 0.5, 0.75, 1.0];

  // Legs swing forward & back
  const angle = 0.55; // ~31 degrees
  const qFwd = new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, 0, 0));
  const qBack = new THREE.Quaternion().setFromEuler(new THREE.Euler(-angle, 0, 0));
  const qZero = new THREE.Quaternion();

  const legLeftTrack = new THREE.QuaternionKeyframeTrack("leg_left.quaternion", times, [
    qZero.x, qZero.y, qZero.z, qZero.w,
    qFwd.x, qFwd.y, qFwd.z, qFwd.w,
    qZero.x, qZero.y, qZero.z, qZero.w,
    qBack.x, qBack.y, qBack.z, qBack.w,
    qZero.x, qZero.y, qZero.z, qZero.w,
  ]);

  const legRightTrack = new THREE.QuaternionKeyframeTrack("leg_right.quaternion", times, [
    qZero.x, qZero.y, qZero.z, qZero.w,
    qFwd.x, qFwd.y, qFwd.z, qFwd.w,
    qZero.x, qZero.y, qZero.z, qZero.w,
    qBack.x, qBack.y, qBack.z, qBack.w,
    qZero.x, qZero.y, qZero.z, qZero.w,
  ]);

  // Arms swing counter to legs
  const armLeftTrack = new THREE.QuaternionKeyframeTrack("arm_left.quaternion", times, [
    qZero.x, qZero.y, qZero.z, qZero.w,
    qBack.x, qBack.y, qBack.z, qBack.w,
    qZero.x, qZero.y, qZero.z, qZero.w,
    qFwd.x, qFwd.y, qFwd.z, qFwd.w,
    qZero.x, qZero.y, qZero.z, qZero.w,
  ]);

  const armRightTrack = new THREE.QuaternionKeyframeTrack("arm_right.quaternion", times, [
    qZero.x, qZero.y, qZero.z, qZero.w,
    qFwd.x, qFwd.y, qFwd.z, qFwd.w,
    qZero.x, qZero.y, qZero.z, qZero.w,
    qBack.x, qBack.y, qBack.z, qBack.w,
    qZero.x, qZero.y, qZero.z, qZero.w,
  ]);

  // Pelvis vertical bob
  const pelvisPosTrack = new THREE.VectorKeyframeTrack("pelvis.position", times, [
    0, 0.45, 0,
    0, 0.48, 0,
    0, 0.45, 0,
    0, 0.48, 0,
    0, 0.45, 0,
  ]);

  const walkClip = new THREE.AnimationClip("Walk", 1.0, [
    legLeftTrack,
    legRightTrack,
    armLeftTrack,
    armRightTrack,
    pelvisPosTrack,
  ]);

  return { root, animations: [walkClip] };
}

// ==========================================
// MAIN RUNNER
// ==========================================
async function main() {
  console.log("Generating 3D city assets into", outDir);

  await exportAndOptimize(buildTownHall(), "town_hall.glb");
  await exportAndOptimize(buildWarehouse(), "warehouse.glb");
  await exportAndOptimize(buildRoadDepot(), "road_depot.glb");
  await exportAndOptimize(buildBarracks(), "barracks.glb");
  await exportAndOptimize(buildWallStraight(), "wall_straight.glb");
  await exportAndOptimize(buildWallCorner(), "wall_corner.glb");
  await exportAndOptimize(buildWallGate(), "wall_gate.glb");
  await exportAndOptimize(buildWallTower(), "wall_tower.glb");
  await exportAndOptimize(buildProps(), "props.glb");

  const citizen = buildCitizen();
  await exportAndOptimize(citizen.root, "citizen.glb", citizen.animations);

  // Clean up temp dir
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log("\nAll 10 GLB city models generated and optimized successfully!");
}

main().catch(err => {
  console.error("Asset generation error:", err);
  process.exit(1);
});
