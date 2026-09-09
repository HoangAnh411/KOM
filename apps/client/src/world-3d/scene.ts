import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { MeshoptDecoder } from "meshoptimizer";
import type { City, EquippedCosmetics, FactionId, WorldSnapshot } from "@kingdoms/shared";
import { campaignMissions, regions, terrainAt, type CampaignMissionKind } from "@kingdoms/shared";
import type { InteractionMode } from "../state.js";
import type { MapSelection, WorldMap } from "../map-contract.js";
import { mapExtent } from "../map-geometry.js";
import { graphicsDpr, graphicsQuality } from "../graphics.js";

const CELL_SIZE = 6;
const WORLD_SIZE = mapExtent * CELL_SIZE;
const ENTER_CITY_ZOOM = 0.3;
const MAX_ZOOM = 5.2;
const ISO_DIRECTION = new THREE.Vector3(0.86, 1.08, 0.86).normalize();

const fallbackAssets = {
  terrain: "/assets/world3d/meridian-256-v2/terrain-lod0.glb",
  terrainLod1: "/assets/world3d/meridian-256-v2/terrain-lod1.glb",
  tower: "/assets/city3d/temp/kenney-v1/castle/tower-square-top-roof-high.glb",
  townHall: "/assets/city3d/temp/kenney-v1/castle/tower-square.glb",
  wall: "/assets/city3d/temp/kenney-v1/castle/wall.glb",
  gate: "/assets/city3d/temp/kenney-v1/castle/gate.glb",
  woodWall: "/assets/city3d/temp/kenney-v1/fantasy/wall-wood.glb",
  tree: "/assets/city3d/temp/kenney-v1/fantasy/tree-high-round.glb",
  crookedTree: "/assets/city3d/temp/kenney-v1/fantasy/tree-crooked.glb",
  redBanner: "/assets/city3d/temp/kenney-v1/fantasy/banner-red.glb",
  greenBanner: "/assets/city3d/temp/kenney-v1/fantasy/banner-green.glb",
  rock: "/assets/city3d/temp/kenney-v1/fantasy/rock-large.glb",
  market: "/assets/city3d/temp/kenney-v1/fantasy/stall-red.glb",
  cart: "/assets/city3d/temp/kenney-v1/fantasy/cart.glb",
  soldier: "/assets/city3d/temp/kenney-v1/characters/character-male-a.glb",
} as const;

type AssetKey = keyof typeof fallbackAssets;
type LoadedAssets = Map<AssetKey, THREE.Group>;

const factionLook: Record<FactionId, { color: number; scale: number }> = {
  meridian: { color: 0x4cb9c9, scale: 1 },
  bastion: { color: 0xc46d4d, scale: 1.12 },
  ravager: { color: 0x9c5148, scale: 0.94 },
  veiled: { color: 0x5eaa78, scale: 1.04 },
};

const hash = (x: number, y: number): number => ((x * 73856093) ^ (y * 19349663)) >>> 0;
const worldX = (x: number): number => (x - (mapExtent - 1) / 2) * CELL_SIZE;
const worldZ = (y: number): number => (y - (mapExtent - 1) / 2) * CELL_SIZE;

function terrainHeight(x: number, y: number): number {
  const terrain = terrainAt(Math.round(x), Math.round(y));
  const ripple = Math.sin(x * 0.31) * 0.22 + Math.cos(y * 0.27) * 0.18;
  if (terrain === "hills") return 2.5 + ripple * 1.8;
  if (terrain === "forest") return 0.45 + ripple;
  if (terrain === "swamp") return -0.32 + ripple * 0.2;
  return ripple * 0.35;
}

function makeTextSprite(text: string, color = "#ffffff"): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext("2d")!;
  context.font = "700 34px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineWidth = 8;
  context.strokeStyle = "rgba(10,18,25,.88)";
  context.strokeText(text, 256, 48);
  context.fillStyle = color;
  context.fillText(text, 256, 48);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(20, 3.75, 1);
  sprite.renderOrder = 50;
  sprite.userData.label = true;
  return sprite;
}

function cloneAsset(loaded: LoadedAssets, key: AssetKey, scale: number): THREE.Group {
  const clone = cloneSkeleton(loaded.get(key)!) as THREE.Group;
  clone.scale.setScalar(scale);
  clone.traverse(child => {
    if (child instanceof THREE.Mesh) {
      child.material = Array.isArray(child.material)
        ? child.material.map(material => material.clone())
        : child.material.clone();
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return clone;
}

function configureAssetTextures(root: THREE.Object3D, anisotropy: number): void {
  root.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) for (const value of Object.values(material)) {
      if (!(value instanceof THREE.Texture)) continue;
      value.generateMipmaps = true;
      value.minFilter = THREE.LinearMipmapLinearFilter;
      value.anisotropy = anisotropy;
      value.needsUpdate = true;
    }
  });
}

function disposeAssetRoot(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    geometries.add(child.geometry);
    const list = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of list) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

function disposeAssets(assets: LoadedAssets): void {
  for (const root of assets.values()) disposeAssetRoot(root);
}

async function loadAssets(manifestUrl: string): Promise<LoadedAssets> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  let urls: Record<AssetKey, string> = { ...fallbackAssets };
  try {
    const response = await fetch(manifestUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json() as {
      terrain: { lod0: string; lod1?: string };
      models: Record<string, string>;
    };
    urls = {
      terrain: manifest.terrain.lod0,
      terrainLod1: manifest.terrain.lod1 ?? manifest.terrain.lod0,
      tower: manifest.models.cityTower!,
      townHall: manifest.models.townHall!,
      wall: manifest.models.cityWall!,
      gate: manifest.models.cityGate!,
      woodWall: manifest.models.woodWall!,
      tree: manifest.models.tree!,
      crookedTree: manifest.models.crookedTree!,
      redBanner: manifest.models.redBanner!,
      greenBanner: manifest.models.greenBanner!,
      rock: manifest.models.rock!,
      market: manifest.models.market!,
      cart: manifest.models.caravan!,
      soldier: manifest.models.army!,
    };
    if (Object.values(urls).some(url => !url)) throw new Error("world asset manifest is incomplete");
  } catch (error) {
    console.warn("World asset manifest unavailable; using the bundled semantic fallback.", error);
  }
  const entries = Object.entries(urls) as Array<[AssetKey, string]>;
  const loadedEntries: Array<[AssetKey, THREE.Group]> = [];
  let nextEntry = 0;
  const loadWorker = async () => {
    for (;;) {
      const entry = entries[nextEntry++];
      if (!entry) return;
      const [key, url] = entry;
      const gltf = await loader.loadAsync(url);
      gltf.scene.updateMatrixWorld(true);
      loadedEntries.push([key, gltf.scene]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, () => loadWorker()));
  return new Map(loadedEntries);
}

function factionFor(city: City & { factionId?: FactionId }, ownPlayerId: string): FactionId {
  if (city.factionId) return city.factionId;
  if (city.playerId === ownPlayerId) return "meridian";
  const options: FactionId[] = ["meridian", "bastion", "ravager", "veiled"];
  return options[Array.from(city.playerId).reduce((sum, char) => sum + char.charCodeAt(0), 0) % options.length]!;
}

function tintModel(root: THREE.Object3D, tint: number, strength: number): void {
  const target = new THREE.Color(tint);
  root.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) if (material instanceof THREE.MeshStandardMaterial) material.color.lerp(target, strength);
  });
}

function cosmeticColor(equipped: EquippedCosmetics | undefined): number | undefined {
  if (equipped?.flag_color === "flag_ember") return 0xd56a45;
  if (equipped?.flag_color === "flag_sea") return 0x268ea5;
  return undefined;
}

function nameplateColor(equipped: EquippedCosmetics | undefined): string {
  return equipped?.nameplate === "nameplate_slate" ? "#b8c3d0" : "#fff5d6";
}

function cityModel(loaded: LoadedAssets, city: City & { visibility?: string; factionId?: FactionId }, ownPlayerId: string, equipped?: EquippedCosmetics): THREE.Group {
  const root = new THREE.Group();
  const unknown = city.visibility === "unknown";
  const faction = unknown ? "meridian" : factionFor(city, ownPlayerId);
  const look = factionLook[faction];
  const mainScale = (unknown ? 2 : faction === "bastion" ? 3.2 : faction === "ravager" ? 2.3 : 2.7) * look.scale;
  const main = cloneAsset(loaded, "townHall", mainScale);
  if (unknown) tintModel(main, 0x66717c, 0.72);
  if (faction === "ravager") tintModel(main, 0x713d27, 0.34);
  if (faction === "veiled") tintModel(main, 0x39785a, 0.28);
  root.add(main);
  const roof = cloneAsset(loaded, "tower", mainScale);
  roof.position.y = 1.31 * mainScale;
  if (unknown) tintModel(roof, 0x66717c, 0.72);
  root.add(roof);
  if (!unknown) {
    // The world silhouette is a small fortified compound assembled from the
    // same authored castle kit as the interior. Keep it within the city marker
    // footprint rather than using the old oversized generated town-hall mesh.
    for (const x of [-2.7, 2.7]) {
      const annex = cloneAsset(loaded, "townHall", 1.45);
      annex.position.set(x, 0, 1.3);
      const annexRoof = cloneAsset(loaded, "tower", 1.45);
      annexRoof.position.set(x, 1.31 * 1.45, 1.3);
      root.add(annex, annexRoof);
    }
    const sideKey: AssetKey = faction === "ravager" ? "woodWall" : faction === "bastion" ? "wall" : faction === "veiled" ? "greenBanner" : "redBanner";
  const sideScale = faction === "bastion" ? 3.1 : faction === "ravager" ? 2.4 : 2.05;
    for (const [x, z, rotation] of [[-4.4, 0, Math.PI / 2], [4.4, 0, Math.PI / 2], [0, -4.4, 0]] as const) {
      const side = cloneAsset(loaded, sideKey, sideScale);
      side.position.set(x, 0, z);
      side.rotation.y = rotation;
      root.add(side);
    }
    if (faction === "bastion") {
      const gate = cloneAsset(loaded, "gate", 3.4);
      gate.position.set(0, 0, 4.2);
      root.add(gate);
    }
    if (faction === "veiled") {
      for (const [x, z] of [[-4.1, 3.2], [4.2, 2.7]] as const) {
        const tree = cloneAsset(loaded, "crookedTree", 2.35);
        tree.position.set(x, 0, z);
        root.add(tree);
      }
    }
  }
  if (city.playerId === ownPlayerId && !unknown && cosmeticColor(equipped)) {
    const flag = cloneAsset(loaded, equipped?.flag_color === "flag_ember" ? "redBanner" : "greenBanner", 0.92);
    flag.position.set(0, 4.2, 0);
    tintModel(flag, cosmeticColor(equipped)!, 0.55);
    root.add(flag);
  }
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(5.7, 6.25, 48),
    new THREE.MeshBasicMaterial({ color: unknown ? 0x9aa3ad : look.color, transparent: true, opacity: 0.72, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  root.add(ring);
  return root;
}

function seatModel(loaded: LoadedAssets, heldBy: "own" | "other" | "none"): THREE.Group {
  const root = new THREE.Group();
  const colors = { own: 0x4cb9c9, other: 0xc46d4d, none: 0xf0d15a } as const;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 2.9, 32),
    new THREE.MeshBasicMaterial({ color: colors[heldBy], transparent: true, opacity: 0.86, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  root.add(ring);
  const flag = cloneAsset(loaded, heldBy === "other" ? "redBanner" : "greenBanner", 0.82);
  flag.position.y = 1.1;
  tintModel(flag, colors[heldBy], heldBy === "none" ? 0.2 : 0.34);
  root.add(flag);
  return root;
}

/** A campaign objective, at the spot on the world the mission names. The colour
 *  says how it is completed — the same word the panel's kind badge carries — so
 *  a scout target and a combat target are told apart at a glance. */
const missionKindColors: Record<CampaignMissionKind, number> = {
  combat: 0xe17b58,
  scout: 0x4cb9c9,
  build: 0x8a7ad4,
  trade: 0xf0d15a,
};

function missionModel(loaded: LoadedAssets, kind: CampaignMissionKind): THREE.Group {
  const root = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.9, 3.5, 32),
    new THREE.MeshBasicMaterial({ color: missionKindColors[kind], transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  root.add(ring);
  const flag = cloneAsset(loaded, "greenBanner", 0.7);
  flag.position.y = 0.9;
  tintModel(flag, missionKindColors[kind], 0.4);
  root.add(flag);
  return root;
}

export function createWorld3DMap(
  container: HTMLElement,
  snapshot: WorldSnapshot,
  ownPlayerId: string,
  onSelect: (selection: MapSelection | undefined) => void,
  onEnterOwnCity: (cityId: string) => void,
  onAssetState?: (state: "loading" | "ready" | "failed") => void,
  initialEquipped?: EquippedCosmetics,
): WorldMap {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  const quality = graphicsQuality();
  renderer.setPixelRatio(graphicsDpr(quality));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = quality !== "low";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.dataset.worldTerrainStyle = "authored-3d-v2";
  renderer.domElement.dataset.worldAssets = "loading";
  renderer.domElement.style.touchAction = "none";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9cc6cf);
  // Exploration fog is rendered by the terrain-following overlay below. A
  // distance fog here would wash out explored terrain and blur the whole map.
  scene.fog = null;
  const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 2400);
  const cameraTarget = new THREE.Vector3(0, 0, 0);
  // Orthographic scale does not depend on camera distance. Keeping the camera
  // near the ground prevents atmospheric fog from washing the entire 256 map
  // into the background colour.
  let cameraDistance = 340;
  let cameraZoom = 0.075;
  let minZoom = 0.3;
  let active = true;
  let destroyed = false;
  let latest = snapshot;
  let equipped = initialEquipped;
  let selected: MapSelection | undefined;
  let interaction: InteractionMode = { kind: "idle" };
  let enteringCity = false;

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE * 1.08, WORLD_SIZE * 1.08),
    new THREE.MeshStandardMaterial({ color: 0x4d8891, roughness: 0.28, metalness: 0.12, transparent: true, opacity: 0.86 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.55;
  scene.add(water);

  scene.add(new THREE.HemisphereLight(0xdcefff, 0x496043, 2.25));
  const sun = new THREE.DirectionalLight(0xfff0cf, 3.2);
  sun.position.set(-260, 380, -180);
  sun.castShadow = true;
  const shadowSize = quality === "high" ? 2048 : 1024;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.left = -180;
  sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -180;
  scene.add(sun);

  const environment = new THREE.Group();
  const entityLayer = new THREE.Group();
  const labelLayer = new THREE.Group();
  scene.add(environment, entityLayer, labelLayer);
  const entityRoots = new Map<string, THREE.Group>();
  const entityLabels = new Map<string, THREE.Sprite>();
  const entitySignatures = new Map<string, string>();
  let loaded: LoadedAssets | undefined;
  let terrainRoot: THREE.Group | undefined;
  let terrainLod1Root: THREE.Group | undefined;
  let assetLoading = false;
  let environmentBuildId = 0;
  let fogTexture: THREE.CanvasTexture | undefined;
  let fogKey = "";
  let decodedExplorationKey = "";
  let decodedExploration = new Uint8Array();

  const exploredAt = (x: number, y: number): boolean => {
    const exploration = latest.exploration;
    if (!exploration.encodedMask) return false;
    const cx = Math.min(exploration.resolution - 1, Math.max(0, Math.floor(x * exploration.resolution / mapExtent)));
    const cy = Math.min(exploration.resolution - 1, Math.max(0, Math.floor(y * exploration.resolution / mapExtent)));
    try {
      if (decodedExplorationKey !== exploration.encodedMask) {
        decodedExplorationKey = exploration.encodedMask;
        decodedExploration = Uint8Array.from(atob(exploration.encodedMask), character => character.charCodeAt(0));
      }
      const bit = cy * exploration.resolution + cx;
      return (decodedExploration[bit >> 3]! & (1 << (bit & 7))) !== 0;
    } catch {
      return false;
    }
  };

  const fogMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
  const fogResolution = Math.max(2, Math.min(latest.exploration.resolution, 64));
  const fogGeometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, fogResolution - 1, fogResolution - 1);
  const fogPositions = fogGeometry.getAttribute("position");
  for (let index = 0; index < fogPositions.count; index += 1) {
    const x = fogPositions.getX(index) / CELL_SIZE + (mapExtent - 1) / 2;
    const y = -fogPositions.getY(index) / CELL_SIZE + (mapExtent - 1) / 2;
    fogPositions.setZ(index, terrainHeight(x, y) + 0.18);
  }
  fogPositions.needsUpdate = true;
  const fogPlane = new THREE.Mesh(fogGeometry, fogMaterial);
  fogPlane.rotation.x = -Math.PI / 2;
  fogPlane.renderOrder = 45;
  scene.add(fogPlane);

  // The objective line: one dashed segment from the player's army to the next
  // mission that needs one on the ground (combat or scout). Two points, updated
  // in place by `syncEntities` — a mission line is the one thing on the map that
  // points at the future rather than describing the present.
  const missionLineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const missionLineMaterial = new THREE.LineDashedMaterial({ color: 0xf0d15a, dashSize: CELL_SIZE * 1.4, gapSize: CELL_SIZE * 0.9, transparent: true, opacity: 0.75, depthTest: false });
  const missionLine = new THREE.Line(missionLineGeometry, missionLineMaterial);
  missionLine.renderOrder = 44;
  missionLine.visible = false;
  scene.add(missionLine);

  const syncFog = () => {
    const resolution = latest.exploration.resolution;
    const nextFogKey = `${resolution}:${latest.exploration.revision}:${latest.exploration.encodedMask}`;
    if (fogKey === nextFogKey) return;
    fogKey = nextFogKey;
    const canvas = document.createElement("canvas");
    canvas.width = resolution;
    canvas.height = resolution;
    const context = canvas.getContext("2d")!;
    for (let y = 0; y < resolution; y += 1) for (let x = 0; x < resolution; x += 1) {
      const tileX = (x + 0.5) * mapExtent / resolution;
      const tileY = (y + 0.5) * mapExtent / resolution;
      context.fillStyle = exploredAt(tileX, tileY) ? "rgba(5,13,20,0.02)" : "rgba(4,10,18,0.82)";
      // The terrain plane maps gameplay y=0 to UV v=1. CanvasTexture flips its
      // upload, so the first gameplay row belongs at the first canvas row.
      context.fillRect(x, y, 1, 1);
    }
    fogTexture?.dispose();
    fogTexture = new THREE.CanvasTexture(canvas);
    fogTexture.colorSpace = THREE.SRGBColorSpace;
    fogTexture.minFilter = THREE.LinearFilter;
    fogTexture.magFilter = THREE.LinearFilter;
    fogMaterial.map = fogTexture;
    fogMaterial.needsUpdate = true;
  };

  const positionAt = (x: number, y: number, extra = 0): THREE.Vector3 =>
    new THREE.Vector3(worldX(x), terrainHeight(x, y) + extra, worldZ(y));

  const clearGroup = (group: THREE.Group) => {
    group.traverse(child => {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.Sprite)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.dispose();
      // Cloned GLBs share their geometry and textures with the loaded asset.
      // Only the selection ring and canvas labels own these GPU resources.
      if (child instanceof THREE.Mesh && child.geometry instanceof THREE.RingGeometry) child.geometry.dispose();
      if (child instanceof THREE.Sprite) child.material.map?.dispose();
    });
    group.clear();
  };

  const rebuildEnvironment = () => {
    if (!loaded) return;
    const buildId = ++environmentBuildId;
    clearGroup(environment);
    // Sparse authored GLB props replace the old circles and triangles. The
    // simulation grid remains invisible underneath for movement rules.
    // Keep the synchronous first frame bounded: cloning and material-isolating
    // a GLB is substantially more expensive than drawing a tile.
    const stride = mapExtent > 96 ? 4 : 1;
    const propLimit = quality === "high" ? 120 : quality === "balanced" ? 80 : 50;
    const placements: Array<{ key: AssetKey; x: number; y: number; scale: number; rotation: number }> = [];
    for (let y = 0; y < mapExtent && placements.length < propLimit; y += stride) for (let x = 0; x < mapExtent && placements.length < propLimit; x += stride) {
      const seed = hash(x, y);
      const biome = terrainAt(x, y);
      if ((biome === "forest" && seed % 7 === 0) || (biome === "plains" && seed % 127 === 0)) {
        placements.push({ key: seed % 2 ? "tree" : "crookedTree", x, y, scale: 2.2 + (seed % 5) * 0.13, rotation: (seed % 12) * Math.PI / 6 });
      } else if (biome === "hills" && seed % 13 === 0) {
        placements.push({ key: "rock", x, y, scale: 1.7 + (seed % 4) * 0.18, rotation: (seed % 8) * Math.PI / 4 });
      }
    }
    let index = 0;
    const buildBatch = () => {
      if (destroyed || buildId !== environmentBuildId || !loaded) return;
      const end = Math.min(index + 12, placements.length);
      for (; index < end; index += 1) {
        const placement = placements[index]!;
        const prop = cloneAsset(loaded, placement.key, placement.scale);
        prop.position.copy(positionAt(placement.x, placement.y));
        prop.rotation.y = placement.rotation;
        environment.add(prop);
      }
      if (index < placements.length) window.setTimeout(buildBatch, 0);
    };
    buildBatch();
  };

  const removeEntity = (id: string) => {
    const root = entityRoots.get(id);
    if (root) { clearGroup(root); entityLayer.remove(root); }
    const label = entityLabels.get(id);
    if (label) {
      label.material.map?.dispose();
      label.material.dispose();
      labelLayer.remove(label);
    }
    entityRoots.delete(id);
    entityLabels.delete(id);
    entitySignatures.delete(id);
  };

  const setEntity = (id: string, signature: string, create: () => THREE.Group, x: number, y: number, label?: string, labelColor?: string) => {
    const existing = entityRoots.get(id);
    if (existing && entitySignatures.get(id) === signature) {
      existing.position.copy(positionAt(x, y));
      entityLabels.get(id)?.position.copy(positionAt(x, y, 11));
      return;
    }
    if (existing) removeEntity(id);
    const root = create();
    root.userData.entityId = id;
    root.position.copy(positionAt(x, y));
    entityLayer.add(root);
    entityRoots.set(id, root);
    entitySignatures.set(id, signature);
    if (label) {
      const sprite = makeTextSprite(label, labelColor);
      sprite.position.copy(positionAt(x, y, 11));
      sprite.userData.entityId = id;
      labelLayer.add(sprite);
      entityLabels.set(id, sprite);
    }
  };

  const syncEntities = () => {
    if (!loaded) return;
    const visible = new Set<string>();
    // Campaign objectives, ours only and only what the fog allows: a mission pin
    // on unexplored ground would be a free scout. Chapter gating caps this at
    // four pins at a time (the current chapter's incomplete missions).
    const campaign = latest.campaignProgress?.[ownPlayerId];
    const unlockedChapter = campaign?.unlockedChapter ?? 1;
    const completedMissions = new Set(campaign?.completedMissionIds ?? []);
    for (const mission of campaignMissions) {
      if (mission.chapter > unlockedChapter || completedMissions.has(mission.id)) continue;
      if (!exploredAt(mission.target.x, mission.target.y)) continue;
      const id = "mission:" + mission.id;
      visible.add(id);
      setEntity(id, mission.kind, () => missionModel(loaded!, mission.kind), mission.target.x, mission.target.y, mission.title);
    }
    for (const region of regions) {
      if (!exploredAt(region.seatX, region.seatY)) continue;
      const holder = latest.regionControl?.[region.code];
      const heldBy = holder === ownPlayerId ? "own" : holder ? "other" : "none";
      const id = "seat:" + region.code;
      visible.add(id);
      setEntity(id, heldBy, () => seatModel(loaded!, heldBy), region.seatX, region.seatY);
    }
    for (const city of latest.cities) {
      if (city.playerId !== ownPlayerId && !exploredAt(city.x, city.y)) continue;
      const visibleCity = city as City & { visibility?: string; factionId?: FactionId };
      const label = visibleCity.visibility === "unknown" ? "Thành chưa xác định" : city.name;
      visible.add(`city:${city.id}`);
      const ownCosmetics = city.playerId === ownPlayerId ? equipped : undefined;
      setEntity(`city:${city.id}`, `${city.visibility}:${city.factionId}:${label}:${ownCosmetics?.flag_color ?? ""}:${ownCosmetics?.nameplate ?? ""}`, () => cityModel(loaded!, visibleCity, ownPlayerId, ownCosmetics), city.x, city.y, label, city.playerId === ownPlayerId ? nameplateColor(ownCosmetics) : undefined);
    }
    for (const node of latest.logistics.resourceNodes) {
      if (!exploredAt(node.x, node.y)) continue;
      visible.add(`node:${node.id}`);
      setEntity(`node:${node.id}`, node.resourceType, () => cloneAsset(loaded!, node.resourceType === "wood" ? "tree" : "rock", node.resourceType === "wood" ? 2.35 : 1.9), node.x, node.y);
    }
    for (const hub of latest.logistics.marketHubs) {
      if (!exploredAt(hub.x, hub.y)) continue;
      visible.add(`hub:${hub.id}`);
      setEntity(`hub:${hub.id}`, hub.name, () => cloneAsset(loaded!, "market", 2.2), hub.x, hub.y, hub.name);
    }
    for (const caravan of latest.caravans) {
      const source = latest.cities.find(city => city.id === caravan.sourceCityId);
      const destination = caravan.destinationKind === "market"
        ? latest.logistics.marketHubs.find(hub => hub.id === caravan.destinationMarketId)
        : latest.cities.find(city => city.id === caravan.destinationCityId);
      if (!source || !destination) continue;
      const x = source.x + (destination.x - source.x) * caravan.progress;
      const y = source.y + (destination.y - source.y) * caravan.progress;
      if (caravan.ownerPlayerId !== ownPlayerId && !exploredAt(x, y)) continue;
      visible.add(`caravan:${caravan.id}`);
      setEntity(`caravan:${caravan.id}`, "cart", () => cloneAsset(loaded!, "cart", 1.55), x, y);
    }
    for (const army of latest.armies) {
      if (army.strength <= 0) continue;
      if (army.ownerPlayerId !== ownPlayerId && !exploredAt(army.x, army.y)) continue;
      visible.add(`army:${army.id}`);
      setEntity(`army:${army.id}`, String(army.strength), () => cloneAsset(loaded!, "soldier", 2.15), army.x, army.y, String(army.strength));
    }
    for (const id of entityRoots.keys()) if (!visible.has(id)) removeEntity(id);
    // Objective line: army → the next mission that wants boots on the ground.
    // Build and trade missions are completed from the city, so no line points at
    // them even when their pin is up.
    const nextGroundMission = campaignMissions.find(mission =>
      !completedMissions.has(mission.id) && mission.chapter <= unlockedChapter &&
      (mission.kind === "combat" || mission.kind === "scout") &&
      exploredAt(mission.target.x, mission.target.y));
    const ownArmy = latest.armies.find(army => army.ownerPlayerId === ownPlayerId && army.strength > 0);
    if (nextGroundMission && ownArmy) {
      missionLineGeometry.setFromPoints([positionAt(ownArmy.x, ownArmy.y, 0.6), positionAt(nextGroundMission.target.x, nextGroundMission.target.y, 0.6)]);
      missionLine.computeLineDistances();
      missionLine.visible = true;
    } else {
      missionLine.visible = false;
    }
  };

  const loadWorldAssets = () => {
    if (assetLoading || destroyed) return;
    assetLoading = true;
    renderer.domElement.dataset.worldAssets = "loading";
    onAssetState?.("loading");
    void loadAssets(snapshot.world.assetManifestUrl).then(result => {
    if (destroyed) {
      disposeAssets(result);
      return;
    }
    loaded = result;
    for (const asset of loaded.values()) configureAssetTextures(asset, renderer.capabilities.getMaxAnisotropy());
    if (terrainRoot) { scene.remove(terrainRoot); clearGroup(terrainRoot); }
    if (terrainLod1Root) { scene.remove(terrainLod1Root); clearGroup(terrainLod1Root); }
    terrainRoot = cloneAsset(loaded, "terrain", 1);
    terrainRoot.name = "authored-world-terrain-glb";
    scene.add(terrainRoot);
    terrainLod1Root = cloneAsset(loaded, "terrainLod1", 1);
    terrainLod1Root.name = "authored-world-terrain-lod1-glb";
    scene.add(terrainLod1Root);
    terrainRoot.updateMatrixWorld(true);
    rebuildEnvironment();
      syncEntities();
      renderer.domElement.dataset.worldAssets = "ready";
      onAssetState?.("ready");
    }).catch(error => {
      renderer.domElement.dataset.worldAssets = "failed";
      onAssetState?.("failed");
    console.error("Không tải được world asset 3D", error);
    }).finally(() => { assetLoading = false; });
  };
  loadWorldAssets();

  syncFog();

  const resize = () => {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const frustum = 55;
    camera.left = -frustum * aspect / 2;
    camera.right = frustum * aspect / 2;
    camera.top = frustum / 2;
    camera.bottom = -frustum / 2;
    // Orthographic bounds are world units, not pixels: the minimum must fit
    // all 256 cells on both axes even on a narrow viewport.
    minZoom = Math.max(0.015, Math.min(frustum, frustum * aspect) / (WORLD_SIZE * 1.5));
    cameraZoom = THREE.MathUtils.clamp(cameraZoom, minZoom, MAX_ZOOM);
    camera.zoom = cameraZoom;
    camera.updateProjectionMatrix();
  };
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  const updateCamera = () => {
    cameraDistance = 340 + 1000 * THREE.MathUtils.clamp((0.4 - cameraZoom) / 0.38, 0, 1);
    camera.position.copy(cameraTarget).addScaledVector(ISO_DIRECTION, cameraDistance);
    camera.lookAt(cameraTarget);
    camera.zoom = cameraZoom;
    camera.updateProjectionMatrix();
    renderer.domElement.dataset.worldZoom = cameraZoom.toFixed(3);
  };

  const screenPosition = (x: number, y: number, extra = 1.5) => {
    const projected = positionAt(x, y, extra).project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (projected.x + 1) * rect.width / 2, y: rect.top + (1 - projected.y) * rect.height / 2 };
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const raycastEntityId = (clientX: number, clientY: number): string | undefined => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const ids = raycaster.intersectObjects(entityLayer.children, true).flatMap(hit => {
      let current: THREE.Object3D | null = hit.object;
      while (current && current.parent !== entityLayer) current = current.parent;
      return typeof current?.userData.entityId === "string" ? [current.userData.entityId as string] : [];
    });
    return ids.find(id => id.startsWith("army:")) ?? ids.find(id => id.startsWith("city:")) ?? ids.find(id => id.startsWith("seat:")) ?? ids.find(id => id.startsWith("mission:"));
  };

  const pickEntity = (clientX: number, clientY: number): MapSelection | undefined => {
    const raycastId = raycastEntityId(clientX, clientY);
    // Armies can be garrisoned on exactly the same world coordinate as a city.
    // The fortress has a much larger mesh, so a raw mesh hit must not win before
    // we compare all nearby markers. This also lets a province seat be selected
    // when its flag is only a few pixels from a garrisoned army.
    let bestArmy: { id: string; distance: number; own: boolean } | undefined;
    for (const army of latest.armies) {
      if (army.strength <= 0) continue;
      const point = screenPosition(army.x, army.y, 0.8);
      const distance = Math.hypot(clientX - point.x, clientY - point.y);
      const own = army.ownerPlayerId === ownPlayerId;
      if (distance <= 50 && (!bestArmy || distance < bestArmy.distance || distance === bestArmy.distance && own && !bestArmy.own)) {
        bestArmy = { id: army.id, distance, own };
      }
    }
    let bestCity: { id: string; distance: number } | undefined;
    for (const city of latest.cities) {
      if (city.playerId !== ownPlayerId && !exploredAt(city.x, city.y)) continue;
      const point = screenPosition(city.x, city.y, 1.2);
      const distance = Math.hypot(clientX - point.x, clientY - point.y);
      if (distance <= 64 && (!bestCity || distance < bestCity.distance)) bestCity = { id: city.id, distance };
    }
    let bestSeat: { x: number; y: number; distance: number } | undefined;
    if (interaction.kind === "idle") {
      for (const region of regions) {
        if (!exploredAt(region.seatX, region.seatY)) continue;
        const point = screenPosition(region.seatX, region.seatY, 0.5);
        const distance = Math.hypot(clientX - point.x, clientY - point.y);
        if (distance <= 72 && (!bestSeat || distance < bestSeat.distance)) {
          bestSeat = { x: region.seatX, y: region.seatY, distance };
        }
      }
    }
    if (bestSeat && (!bestCity || bestSeat.distance < bestCity.distance)) {
      if (!bestArmy || bestSeat.distance < bestArmy.distance) {
        return { kind: "tile", x: bestSeat.x, y: bestSeat.y };
      }
    }
    if (bestArmy && (!bestCity || bestArmy.distance <= bestCity.distance)) return { kind: "army", id: bestArmy.id };
    if (bestCity) return { kind: "city", id: bestCity.id };
    if (raycastId?.startsWith("city:")) return { kind: "city", id: raycastId.slice(5) };
    if (interaction.kind === "idle" && raycastId?.startsWith("seat:")) {
      const region = regions.find(item => item.code === raycastId.slice(5));
      if (region) return { kind: "tile", x: region.seatX, y: region.seatY };
    }
    if (raycastId?.startsWith("mission:")) {
      const mission = campaignMissions.find(item => item.id === raycastId.slice("mission:".length));
      if (mission) return { kind: "tile", x: mission.target.x, y: mission.target.y };
    }
    if (raycastId?.startsWith("army:")) return { kind: "army", id: raycastId.slice(5) };
    return undefined;
  };

  // Province seats remain explicit move targets. A seat marker is slightly
  // above the ground and the authored 3D projection can put its visual centre
  // a few pixels away from the terrain ray; snapping only the marker keeps
  // ordinary ground clicks exact without redirecting clicks near armies.
  const pickSeat = (clientX: number, clientY: number): MapSelection | undefined => {
    if (!latest.exploration.encodedMask) return undefined;
    let best: { x: number; y: number; distance: number } | undefined;
    for (const region of regions) {
      if (!exploredAt(region.seatX, region.seatY)) continue;
      const point = screenPosition(region.seatX, region.seatY, 0.5);
      const distance = Math.hypot(clientX - point.x, clientY - point.y);
      if (distance <= 14 && (!best || distance < best.distance)) {
        best = { x: region.seatX, y: region.seatY, distance };
      }
    }
    return best ? { kind: "tile", x: best.x, y: best.y } : undefined;
  };

  const groundPoint = (clientX: number, clientY: number, planeY?: number): THREE.Vector3 | undefined => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const result = new THREE.Vector3();
    if (planeY !== undefined) {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
      return raycaster.ray.intersectPlane(plane, result) ?? undefined;
    }
    if (terrainRoot) {
      const terrainHit = raycaster.intersectObject(terrainRoot, true)[0];
      if (terrainHit) return terrainHit.point.clone();
    }
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    return raycaster.ray.intersectPlane(plane, result) ?? undefined;
  };

  const selectAt = (clientX: number, clientY: number) => {
    // Move orders target the exact ground tile under the pointer. Entity
    // proximity is useful for normal selection and attack orders, but it would
    // silently redirect a move to a nearby city or army.
    const entity = interaction.kind === "move" ? undefined : pickEntity(clientX, clientY);
    if (entity) { onSelect(entity); return; }
    const seat = pickSeat(clientX, clientY);
    if (seat) { onSelect(seat); return; }
    const point = groundPoint(clientX, clientY);
    if (!point) { onSelect(undefined); return; }
    const x = Math.round(point.x / CELL_SIZE + (mapExtent - 1) / 2);
    const y = Math.round(point.z / CELL_SIZE + (mapExtent - 1) / 2);
    if (interaction.kind === "idle") {
      const nearbySeat = regions
        .filter(region => exploredAt(region.seatX, region.seatY))
        .map(region => ({ region, distance: Math.abs(region.seatX - x) + Math.abs(region.seatY - y) }))
        .sort((a, b) => a.distance - b.distance)[0];
      if (nearbySeat && nearbySeat.distance <= 2) {
        onSelect({ kind: "tile", x: nearbySeat.region.seatX, y: nearbySeat.region.seatY });
        return;
      }
    }
    onSelect(x >= 0 && y >= 0 && x < mapExtent && y < mapExtent ? { kind: "tile", x, y } : undefined);
  };

  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let pinchDistance = 0;
  let lastPinchCenter = new THREE.Vector2();
  let dragAnchor: THREE.Vector3 | undefined;
  let dragPlaneY = 0;
  const pointers = new Map<number, { x: number; y: number }>();

  const tryEnterCity = () => {
    if (enteringCity || !active || interaction.kind !== "idle" || cameraZoom < ENTER_CITY_ZOOM) return;
    const city = latest.cities.find(item => item.playerId === ownPlayerId);
    // A pinch is allowed to translate its midpoint while zooming. Keep enough
    // room for that legitimate movement when the gesture started over the city.
    if (!city || cameraTarget.distanceTo(positionAt(city.x, city.y)) > CELL_SIZE * 3) return;
    enteringCity = true;
    renderer.domElement.dataset.cityTransition = "entering";
    cameraTarget.copy(positionAt(city.x, city.y));
    window.setTimeout(() => { if (!destroyed && enteringCity) onEnterOwnCity(city.id); }, 420);
  };

  const onPointerDown = (event: PointerEvent) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { renderer.domElement.setPointerCapture(event.pointerId); } catch { /* Synthetic pointer events have no native capture. */ }
    dragging = true;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    lastX = event.clientX;
    lastY = event.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDistance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      lastPinchCenter.set((a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      updateCamera();
      dragAnchor = groundPoint(lastPinchCenter.x, lastPinchCenter.y);
    } else {
      updateCamera();
      dragAnchor = groundPoint(event.clientX, event.clientY);
      dragPlaneY = dragAnchor?.y ?? 0;
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const center = new THREE.Vector2((a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      updateCamera();
      const zoomBefore = groundPoint(center.x, center.y);
      if (pinchDistance > 0) cameraZoom = THREE.MathUtils.clamp(cameraZoom * distance / pinchDistance, minZoom, MAX_ZOOM);
      updateCamera();
      const zoomAfter = groundPoint(center.x, center.y);
      if (zoomBefore && zoomAfter) cameraTarget.add(zoomBefore.sub(zoomAfter));
      updateCamera();
      const panBefore = groundPoint(lastPinchCenter.x, lastPinchCenter.y);
      const panAfter = groundPoint(center.x, center.y);
      if (panBefore && panAfter) cameraTarget.add(panBefore.sub(panAfter));
      pinchDistance = distance;
      lastPinchCenter.copy(center);
      moved = true;
      tryEnterCity();
      return;
    }
    if (!dragging) return;
    moved = moved || Math.hypot(event.clientX - startX, event.clientY - startY) >= 4;
    updateCamera();
    const current = groundPoint(event.clientX, event.clientY, dragPlaneY);
    if (dragAnchor && current) cameraTarget.add(dragAnchor.clone().sub(current));
    const limit = WORLD_SIZE / 2;
    cameraTarget.x = THREE.MathUtils.clamp(cameraTarget.x, -limit, limit);
    cameraTarget.z = THREE.MathUtils.clamp(cameraTarget.z, -limit, limit);
    lastX = event.clientX;
    lastY = event.clientY;
  };
  const onPointerUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (event.type !== "pointercancel" && !moved && pointers.size === 0) selectAt(event.clientX, event.clientY);
    dragging = pointers.size > 0;
    if (pointers.size < 2) {
      pinchDistance = 0;
      if (pointers.size === 1) {
        const remaining = [...pointers.values()][0]!;
        updateCamera();
        dragAnchor = groundPoint(remaining.x, remaining.y);
        dragPlaneY = dragAnchor?.y ?? 0;
        startX = remaining.x;
        startY = remaining.y;
      } else {
        dragAnchor = undefined;
      }
    }
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    updateCamera();
    const before = groundPoint(event.clientX, event.clientY);
    const next = THREE.MathUtils.clamp(cameraZoom * Math.exp(-event.deltaY * 0.00145), minZoom, MAX_ZOOM);
    cameraZoom = next;
    updateCamera();
    const after = groundPoint(event.clientX, event.clientY);
    if (before && after) cameraTarget.add(before.sub(after));
    tryEnterCity();
  };
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("pointercancel", onPointerUp);
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

  const focusCity = (x: number, y: number) => {
    cameraTarget.copy(positionAt(x, y));
  };

  const clock = new THREE.Clock();
  let frame: number | undefined;
  const stopRendering = () => {
    if (frame === undefined) return;
    cancelAnimationFrame(frame);
    frame = undefined;
  };
  const render = () => {
    frame = undefined;
    if (destroyed || !active || document.hidden) return;
    // Dialogs cover the world. Keep the loop alive so closing one is observed,
    // but skip every GPU update and draw while it is present.
    if (!document.querySelector("[role=dialog]")) {
      updateCamera();
      const pulse = 0.78 + Math.sin(clock.getElapsedTime() * 2.1) * 0.12;
      for (const root of entityRoots.values()) {
        const ring = root.children.find(child => child instanceof THREE.Mesh && child.geometry instanceof THREE.RingGeometry) as THREE.Mesh | undefined;
        const entityId = String(root.userData.entityId ?? "");
        if (ring) {
          ring.visible = entityId.startsWith("seat:") || entityId.startsWith("mission:") ||
            (selected?.kind === "city" && entityId === "city:" + selected.id);
        }
        if (ring) (ring.material as THREE.MeshBasicMaterial).opacity = pulse;
      }
      const labelScale = THREE.MathUtils.clamp(1.25 / cameraZoom, 0.32, 2.4);
      for (const label of labelLayer.children) {
        label.scale.set(20 * labelScale, 3.75 * labelScale, 1);
        label.visible = cameraZoom > 0.28;
      }
      environment.visible = cameraZoom > 0.32;
      if (terrainRoot && terrainLod1Root) {
        const useDetailedTerrain = cameraZoom > 0.22;
        terrainRoot.visible = useDetailedTerrain;
        terrainLod1Root.visible = !useDetailedTerrain;
      }
      renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(render);
  };
  const startRendering = () => {
    if (frame === undefined && !destroyed && active && !document.hidden) frame = requestAnimationFrame(render);
  };
  const onVisibilityChange = () => {
    if (document.hidden) stopRendering();
    else startRendering();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  startRendering();

  const ownCity = snapshot.cities.find(city => city.playerId === ownPlayerId);
  if (ownCity) focusCity(ownCity.x, ownCity.y);

  return {
    update(next, nextSelection, nextEquipped) {
      if (destroyed) return;
      latest = next;
      selected = nextSelection;
      equipped = nextEquipped;
      syncFog();
      syncEntities();
    },
    focusCity,
    setInteraction(mode) {
      interaction = mode;
      renderer.domElement.style.cursor = interaction.kind === "idle" ? "grab" : "crosshair";
    },
    retryAssets: loadWorldAssets,
    setActive(next) {
      if (next && !active) {
        // Return one level above the entry threshold so a fresh inward gesture
        // is required before entering again, even after a snapshot arrives.
        cameraZoom = Math.min(cameraZoom, 1.9);
        enteringCity = false;
        delete renderer.domElement.dataset.cityTransition;
      }
      active = next;
      if (active) startRendering();
      else stopRendering();
    },
    destroy() {
      destroyed = true;
      environmentBuildId += 1;
      stopRendering();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      scene.traverse(child => {
        if (!(child instanceof THREE.Mesh || child instanceof THREE.Sprite)) return;
        if (child.geometry) geometries.add(child.geometry);
        const list = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of list) {
          materials.add(material);
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        }
      });
      for (const texture of textures) texture.dispose();
      for (const material of materials) material.dispose();
      for (const geometry of geometries) geometry.dispose();
      // A THREE.Line is neither Mesh nor Sprite, so the traverse above skips it.
      missionLineGeometry.dispose();
      missionLineMaterial.dispose();
      if (loaded) disposeAssets(loaded);
      loaded = undefined;
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
