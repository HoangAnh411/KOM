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
import { effectTierFor } from "./effect-tiers.js";
import { chipFor, type ChipEntity, type ChipPlan, type ChipTone, CHIP_TEXT_ZOOM } from "./label-chips.js";
import { scatterProps, type PropAssetKey, type PropPlacement } from "./prop-scatter.js";
import { buildHeightfield, type Heightfield } from "./heightfield.js";
import { planRoads, type RoadEndpoint, type RoadSegment } from "./roads.js";
import { iconPaths } from "../ui/icon-paths.js";

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
  plainTree: "/assets/city3d/temp/kenney-v1/fantasy/tree.glb",
  crookedTree: "/assets/city3d/temp/kenney-v1/fantasy/tree-crooked.glb",
  redBanner: "/assets/city3d/temp/kenney-v1/fantasy/banner-red.glb",
  greenBanner: "/assets/city3d/temp/kenney-v1/fantasy/banner-green.glb",
  rock: "/assets/city3d/temp/kenney-v1/fantasy/rock-large.glb",
  rockSmall: "/assets/city3d/temp/kenney-v1/fantasy/rock-small.glb",
  market: "/assets/city3d/temp/kenney-v1/fantasy/stall-red.glb",
  stallGreen: "/assets/city3d/temp/kenney-v1/fantasy/stall-green.glb",
  poles: "/assets/city3d/temp/kenney-v1/fantasy/poles.glb",
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

const worldX = (x: number): number => (x - (mapExtent - 1) / 2) * CELL_SIZE;
const worldZ = (y: number): number => (y - (mapExtent - 1) / 2) * CELL_SIZE;

/** Scatter placements name the prop they want; the loader keys name the GLB.
 *  The two vocabularies stay separate so the scatter module never learns about
 *  asset URLs, and the round tree keeps its long-standing `tree` manifest id. */
const propAssetSources: Record<PropAssetKey, AssetKey> = {
  roundTree: "tree",
  plainTree: "plainTree",
  crookedTree: "crookedTree",
  rock: "rock",
  rockSmall: "rockSmall",
};

/** A scatter placement the heightfield has answered for: `height` is the
 *  terrain surface under the (jittered) cell, so instance matrices never lean
 *  on the analytic `terrainHeight` — that function does not know where the sea
 *  is, and a tree standing on open water is the loudest possible bug. */
type GroundedProp = PropPlacement & { height: number };

function terrainHeight(x: number, y: number): number {
  const terrain = terrainAt(Math.round(x), Math.round(y));
  const ripple = Math.sin(x * 0.31) * 0.22 + Math.cos(y * 0.27) * 0.18;
  if (terrain === "hills") return 2.5 + ripple * 1.8;
  if (terrain === "forest") return 0.45 + ripple;
  if (terrain === "swamp") return -0.32 + ripple * 0.2;
  return ripple * 0.35;
}

/** Chip tone colours, kept beside `factionLook` so the map's whole palette
 *  lives in one place. These are Three.js hex values, not design tokens: the
 *  stylesheet's palette rule governs DOM colour, not scene materials. */
const chipToneColors: Record<ChipTone, string> = {
  own: "#4cb9c9",
  other: "#c46d4d",
  neutral: "#e8e2cf",
  mission: "#f0d15a",
};

/** The label a chip renders is one shared texture: a tone-coloured dot, cached
 *  per tone so a hundred far-away armies cost one texture, not a hundred. The
 *  white outer ring is what keeps a dot readable on bright sand, dark fog and
 *  every green between — a bare tone disc disappears into the terrain. */
const dotTextureCache = new Map<string, THREE.CanvasTexture>();
function dotTexture(tone: keyof typeof chipToneColors): THREE.CanvasTexture {
  const cached = dotTextureCache.get(tone);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d")!;
  context.beginPath();
  context.arc(32, 32, 29, 0, Math.PI * 2);
  context.fillStyle = "rgba(248,250,252,.95)";
  context.fill();
  context.beginPath();
  context.arc(32, 32, 23, 0, Math.PI * 2);
  context.lineWidth = 5;
  context.strokeStyle = "rgba(10,18,25,.9)";
  context.stroke();
  context.fillStyle = chipToneColors[tone];
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  dotTextureCache.set(tone, texture);
  return texture;
}

/** A pill: the entity's glyph, the number that makes it actionable, and only
 *  past the text zoom the name. The icon is the same `iconPaths` glyph the DOM
 *  uses, drawn onto the canvas with a Path2D so map and panels agree on shapes.
 *  Readability is the whole job of this texture: a tone-coloured border so the
 *  pill owns its edge against terrain, the value in white (tone colours are
 *  decorative at 30px, not legible), and a soft tone glow so the pill lifts off
 *  busy ground. `toneColor` overrides the tone's colour — it is how an equipped
 *  nameplate cosmetic keeps colouring the player's own city on the map. */
function makeChipTexture(plan: ChipPlan & { mode: "chip" }, toneColor = chipToneColors[plan.tone]): THREE.CanvasTexture {
  const tone = toneColor ?? chipToneColors[plan.tone];
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext("2d")!;
  context.textBaseline = "middle";
  const iconSize = 44;
  const iconWidth = iconSize + 12;
  context.font = "700 40px system-ui, sans-serif";
  const valueText = plan.value ?? "";
  const valueWidth = valueText ? context.measureText(valueText).width + 12 : 0;
  const nameText = plan.text ?? "";
  context.font = "600 30px system-ui, sans-serif";
  const nameWidth = nameText ? context.measureText(nameText).width + 14 : 0;
  const contentWidth = iconWidth + valueWidth + nameWidth;
  const pillX = 256 - contentWidth / 2;
  context.save();
  context.shadowColor = tone;
  context.shadowBlur = 18;
  context.beginPath();
  context.roundRect(pillX - 16, 6, contentWidth + 32, 84, 46);
  context.fillStyle = "rgba(8,15,22,.92)";
  context.fill();
  context.restore();
  context.beginPath();
  context.roundRect(pillX - 16, 6, contentWidth + 32, 84, 46);
  context.lineWidth = 5;
  context.strokeStyle = tone;
  context.stroke();
  context.save();
  context.translate(pillX, 48 - iconSize / 2);
  context.scale(iconSize / 24, iconSize / 24);
  context.lineWidth = 2.7 * 24 / iconSize;
  context.strokeStyle = tone;
  context.stroke(new Path2D(iconPaths[plan.icon]));
  context.restore();
  let cursorX = pillX + iconWidth;
  if (valueText) {
    context.font = "700 40px system-ui, sans-serif";
    context.textAlign = "left";
    context.fillStyle = "#f8fafc";
    context.fillText(valueText, cursorX, 50);
    cursorX += valueWidth;
  }
  if (nameText) {
    context.font = "600 30px system-ui, sans-serif";
    context.fillStyle = "#e6ebef";
    context.fillText(nameText, cursorX, 52);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Re-point an existing label sprite at a new chip plan, rebuilding the texture
 *  only when the plan actually changed — zoom moves continuously, so this runs
 *  every frame and must usually do nothing. Dot textures are shared per tone
 *  and must never be disposed by the sprite that borrowed one; `ownsMap` is the
 *  borrow bookkeeping, read again by `removeEntity`. */
function applyChipPlan(sprite: THREE.Sprite, plan: ChipPlan, toneColor?: string): void {
  const key = (plan.mode === "chip" ? `chip:${plan.icon}:${plan.value ?? ""}:${plan.text ?? ""}` : `dot:${plan.tone}`) +
    (plan.mode === "chip" && toneColor ? `@${toneColor}` : "");
  if (sprite.userData.chipKey === key) return;
  if (sprite.userData.ownsMap) sprite.material.map?.dispose();
  sprite.userData.chipKey = key;
  sprite.userData.ownsMap = plan.mode === "chip";
  sprite.userData.isDot = plan.mode === "dot";
  sprite.material.map = plan.mode === "dot" ? dotTexture(plan.tone) : makeChipTexture(plan, toneColor);
  sprite.material.needsUpdate = true;
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
      // Decorative scatter assets: an older manifest may not name them — that
      // must not fail the whole load, the bundled kenney kit stands in.
      plainTree: manifest.models.plainTree ?? fallbackAssets.plainTree,
      crookedTree: manifest.models.crookedTree!,
      redBanner: manifest.models.redBanner!,
      greenBanner: manifest.models.greenBanner!,
      rock: manifest.models.rock!,
      rockSmall: manifest.models.rockSmall ?? fallbackAssets.rockSmall,
      market: manifest.models.market!,
      stallGreen: manifest.models.stallGreen ?? fallbackAssets.stallGreen,
      poles: manifest.models.poles ?? fallbackAssets.poles,
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

/** The authored terrain GLB is graded flat, and its colour comes from
 *  textures — `material.color` is white, so adjusting it (the obvious move) is
 *  a no-op: white has no saturation to boost. The grade has to happen to the
 *  shaded fragment itself. Applied only to the terrain roots: props and
 *  entities keep their authored look.
 *
 *  Three passes run on the finished pixel. Saturation/contrast is what turns
 *  "forest" and "hills" from two brightnesses of the same mud into two
 *  different colours. Slope shading darkens anything but the ground's own
 *  up-vector, which is what makes a hill read as a volume instead of a green
 *  smear. And a two-octave value noise on world position breaks the painted
 *  flatness of the baked texture — the eye forgives a plain colour when it
 *  has grain, and reads "unfinished asset" when it does not.
 *
 *  The injection point is the last include in the standard fragment shader, so
 *  it sees the finished pixel — texture, light and tone mapping included. The
 *  two varyings are injected alongside, on the same compile pass. */
const TERRAIN_GRADE = `
{
  vec3 graded = gl_FragColor.rgb;
  float luma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
  graded = mix(vec3(luma), graded, 1.45);
  graded = (graded - 0.5) * 1.14 + 0.5;
  graded *= mix(0.86, 1.04, clamp(normalize(vWorldNormal).y, 0.0, 1.0));
  vec2 grainCell = vWorldPos.xz * 0.67;
  vec2 grainIndex = floor(grainCell);
  vec2 grainBlend = fract(grainCell);
  grainBlend = grainBlend * grainBlend * (3.0 - 2.0 * grainBlend);
  float grainA = fract(sin(dot(grainIndex, vec2(127.1, 311.7))) * 43758.5453);
  float grainB = fract(sin(dot(grainIndex + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float grainC = fract(sin(dot(grainIndex + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float grainD = fract(sin(dot(grainIndex + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float grain = mix(mix(grainA, grainB, grainBlend.x), mix(grainC, grainD, grainBlend.x), grainBlend.y);
  grain = grain * 0.65 + 0.35 * fract(sin(dot(grainIndex * 2.7, vec2(127.1, 311.7))) * 43758.5453);
  graded *= 0.955 + grain * 0.09;
  gl_FragColor.rgb = clamp(graded, 0.0, 1.0);
}`;

const TERRAIN_VARYINGS = "varying vec3 vWorldPos;\nvarying vec3 vWorldNormal;\n";

function enrichTerrainColors(root: THREE.Object3D): void {
  root.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      const previous = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        previous?.(shader, renderer);
        shader.vertexShader = TERRAIN_VARYINGS + shader.vertexShader
          .replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;")
          .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n\tvWorldNormal = normalize(mat3(modelMatrix) * objectNormal);");
        shader.fragmentShader = TERRAIN_VARYINGS + shader.fragmentShader.replace("#include <dithering_fragment>", `#include <dithering_fragment>\n${TERRAIN_GRADE}`);
      };
    }
  });
}

function cosmeticColor(equipped: EquippedCosmetics | undefined): number | undefined {
  if (equipped?.flag_color === "flag_ember") return 0xd56a45;
  if (equipped?.flag_color === "flag_sea") return 0x268ea5;
  return undefined;
}

/** Shared across every city: `clearGroup` only disposes a per-entity
 *  `RingGeometry`, so a per-city disc would leak one geometry per rebuild.
 *  One shared geometry is collected once by `destroy`'s scene-wide sweep. */
let cityDiscGeometry: THREE.CircleGeometry | undefined;

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
  // A soft dark disc under the compound: the fortress models sit in the same
  // value range as the terrain they stand on, and without a shadow of their own
  // at map zoom they read as terrain lumps. The disc is the cheapest possible
  // ground for them — one quad, no depth write, under everything the city owns.
  cityDiscGeometry ??= new THREE.CircleGeometry(7.8, 40);
  const disc = new THREE.Mesh(cityDiscGeometry, new THREE.MeshBasicMaterial({ color: 0x0a1219, transparent: true, opacity: 0.3, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;
  root.add(disc);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(5.7, 6.25, 48),
    new THREE.MeshBasicMaterial({ color: unknown ? 0x9aa3ad : look.color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.09;
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

/** A market hub reads as a small trading post, not a lone stall: the red stall
 *  stays the centre with a green neighbour, a parked cart and a goods pole —
 *  the same compose-from-the-kit pattern the city compounds use. */
function hubModel(loaded: LoadedAssets): THREE.Group {
  const root = new THREE.Group();
  root.add(cloneAsset(loaded, "market", 2.2));
  const green = cloneAsset(loaded, "stallGreen", 1.9);
  green.position.set(-3.8, 0, 1.5);
  green.rotation.y = Math.PI / 7;
  root.add(green);
  const cart = cloneAsset(loaded, "cart", 1.5);
  cart.position.set(3.4, 0, 2.1);
  cart.rotation.y = -Math.PI / 5;
  root.add(cart);
  const goods = cloneAsset(loaded, "poles", 2.0);
  goods.position.set(0.4, 0, -3.2);
  root.add(goods);
  return root;
}

/** A flat ribbon along a path of ground points — the same construction the
 *  city interior paves its streets with (city-3d/scene.ts `roadRibbon`), with
 *  the fixed street height replaced by each sample's terrain height so a world
 *  road rides the land instead of cutting through it. */
function groundRibbon(points: THREE.Vector3[], width: number, material: THREE.Material): THREE.Mesh | null {
  if (points.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.25);
  const samples = Math.max(12, points.length * 8);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(width / 2);
    positions.push(point.x + normal.x, point.y, point.z + normal.z, point.x - normal.x, point.y, point.z - normal.z);
    uvs.push(0, t * points.length, 1, t * points.length);
    if (i < samples) {
      const offset = i * 2;
      indices.push(offset, offset + 2, offset + 1, offset + 2, offset + 3, offset + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
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
  const tier = effectTierFor(quality);
  renderer.setPixelRatio(graphicsDpr(quality));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // ACES trades a little saturation for highlights that roll off instead of
  // clipping; the authored terrain was graded under it. Low tier keeps the
  // linear path — it is the one per-fragment cost a weak GPU can skip whole.
  if (tier.toneMapping) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
  }
  renderer.shadowMap.enabled = quality !== "low";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.dataset.worldTerrainStyle = "authored-3d-v2";
  renderer.domElement.dataset.worldAssets = "loading";
  renderer.domElement.style.touchAction = "none";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9cc6cf);
  if (tier.sky === "gradient") {
    // A two-colour dome behind the fog-less horizon. BackSide and depthWrite off
    // keep it a backdrop: nothing on the map can be occluded by or cast onto it.
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(2100, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uZenith: { value: new THREE.Color(0x5ea8c8) },
          uHorizon: { value: new THREE.Color(0xdcecec) },
        },
        vertexShader: "varying vec3 vWorld; void main() { vWorld = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "uniform vec3 uZenith; uniform vec3 uHorizon; varying vec3 vWorld; void main() { float h = clamp(normalize(vWorld).y * 1.6 + 0.22, 0.0, 1.0); gl_FragColor = vec4(mix(uHorizon, uZenith, h), 1.0); }",
      }),
    );
    sky.renderOrder = -1;
    scene.add(sky);
  }
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

  // The water plane carries wave displacement in the vertex shader when the
  // tier pays for it; the segments exist either way so the mesh is the same
  // object on every device and only the shader work differs.
  const waterUniforms = { uTime: { value: 0 }, uWaveSpeed: { value: tier.waterAnimationSpeed } };
  const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x2f7f96, roughness: 0.22, metalness: 0.14, transparent: true, opacity: 0.9 });
  if (tier.waterAnimation) {
    waterMaterial.onBeforeCompile = shader => {
      shader.uniforms.uTime = waterUniforms.uTime;
      shader.uniforms.uWaveSpeed = waterUniforms.uWaveSpeed;
      shader.vertexShader = "uniform float uTime;\nuniform float uWaveSpeed;\n" + shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n\t\ttransformed.z += sin(position.x * 0.045 + uTime * 1.3 * uWaveSpeed) * 0.14 + cos(position.y * 0.05 + uTime * 0.9 * uWaveSpeed) * 0.1;",
      );
    };
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE * 1.08, WORLD_SIZE * 1.08, 96, 96), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.55;
  scene.add(water);
  // The horizon filler. At far zoom the frustum sees well past the map edge,
  // and past the 1.08x water sheet the pale sky dome read as a blank wash
  // behind the continent — the map floated on a sheet of paper. A second,
  // still ocean sheet extends the sea to the horizon instead, so the far view
  // reads as a continent on open water, the same sea the near view already
  // shows. Slightly darker than the animated water so the map's own sea keeps
  // a subtle shoreline step; no waves, no segments — it is pure backdrop.
  const oceanMaterial = new THREE.MeshStandardMaterial({ color: 0x28687f, roughness: 0.32, metalness: 0.1 });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE * 4, WORLD_SIZE * 4), oceanMaterial);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.62;
  ocean.renderOrder = -1;
  scene.add(ocean);

  // The hemisphere light is deliberately weaker than the sun: sky-fill at
  // anything like the sun's strength washes the terrain's own colours into the
  // grey-green the authored GLB was graded against. Sun-dominant lighting is
  // what keeps the biomes distinct.
  scene.add(new THREE.HemisphereLight(0xdcefff, 0x496043, 1.55));
  const sun = new THREE.DirectionalLight(0xfff0cf, 3.8);
  sun.position.set(-260, 380, -180);
  // The shadow frustum travels with the camera target. A fixed frustum around
  // the origin only ever shadowed the map's middle third — the world is 1536
  // units wide — so everywhere else rendered shadowless, which reads as flat.
  const sunOffset = sun.position.clone();
  scene.add(sun, sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(tier.shadowMapSize, tier.shadowMapSize);
  sun.shadow.camera.left = -110;
  sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110;
  sun.shadow.camera.bottom = -110;

  const environment = new THREE.Group();
  const roadLayer = new THREE.Group();
  const entityLayer = new THREE.Group();
  const labelLayer = new THREE.Group();
  scene.add(environment, roadLayer, entityLayer, labelLayer);

  // Bloom is the one effect whose code is heavier than its shader: the passes
  // are imported dynamically so the base bundle never carries them, and any
  // failure to build the chain (older WebGL, shader compile) silently leaves
  // the direct render in place. Declared before `resize` because a viewport
  // change while the import is in flight must still reach the composer.
  let composer: { render: () => void; setSize: (width: number, height: number) => void; dispose: () => void } | undefined;
  if (tier.bloom) {
    void Promise.all([
      import("three/addons/postprocessing/EffectComposer.js"),
      import("three/addons/postprocessing/RenderPass.js"),
      import("three/addons/postprocessing/UnrealBloomPass.js"),
      import("three/addons/postprocessing/OutputPass.js"),
    ]).then(([{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }]) => {
      if (destroyed) return;
      const chain = new EffectComposer(renderer);
      chain.addPass(new RenderPass(scene, camera));
      chain.addPass(new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.3, 0.55, 0.86));
      chain.addPass(new OutputPass());
      composer = chain;
    }).catch(() => { /* Direct render is the fallback, not an error state. */ });
  }
  const entityRoots = new Map<string, THREE.Group>();
  const entityLabels = new Map<string, THREE.Sprite>();
  const entityChips = new Map<string, ChipEntity>();
  const entitySignatures = new Map<string, string>();
  let loaded: LoadedAssets | undefined;
  let terrainRoot: THREE.Group | undefined;
  let terrainLod1Root: THREE.Group | undefined;
  let assetLoading = false;
  /** The terrain's own surface, binned from its vertices at load — the coast
   *  line and true ground the scatter and roads are placed against. */
  let heightfield: Heightfield | undefined;
  let propSets: Array<{ placements: GroundedProp[]; meshes: THREE.InstancedMesh[]; sourceMatrices: THREE.Matrix4[] }> = [];
  let roadSignature = "";
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

  // The fog plane is an interface overlay, not a physical surface, so it does
  // not join the scene's tone mapping: ACES crushes its near-black fill to a
  // luma of ~3, which turned every unexplored stretch into a black tarp. With
  // `toneMapped = false` the canvas colours below are what lands on screen.
  const fogMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
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

  // The objective's other half: a vertical light shaft at the mission itself,
  // readable at any zoom where the dashed line on the ground is a grey thread.
  // `ring` tiers keep the ground marker only — an additive shaft is exactly the
  // kind of fill-rate cost the low tier exists to skip.
  const missionBeaconMaterial = new THREE.MeshBasicMaterial({ color: 0xf0d15a, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const missionBeacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 34, 12, 1, true), missionBeaconMaterial);
  missionBeacon.renderOrder = 43;
  missionBeacon.visible = false;
  scene.add(missionBeacon);

  const syncFog = () => {
    const resolution = latest.exploration.resolution;
    const nextFogKey = `${resolution}:${latest.exploration.revision}:${latest.exploration.encodedMask}`;
    if (fogKey === nextFogKey) return;
    fogKey = nextFogKey;
    const canvas = document.createElement("canvas");
    canvas.width = resolution;
    canvas.height = resolution;
    const context = canvas.getContext("2d")!;
    // The mask sampled once, so a texel can ask about its neighbours for the
    // soft rim at the frontier.
    const explored: boolean[][] = Array.from({ length: resolution }, (_, y) =>
      Array.from({ length: resolution }, (_, x) => exploredAt((x + 0.5) * mapExtent / resolution, (y + 0.5) * mapExtent / resolution)));
    // How deep inside the mist a texel sits: Chebyshev distance in texels to
    // the nearest explored one, capped at 2 — the frontier fades over two
    // bands instead of ending at a cliff.
    const frontierDepth = (x: number, y: number): number => {
      for (const radius of [1, 2]) {
        for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
          if (explored[y + dy]?.[x + dx] === true) return radius;
        }
      }
      return 3;
    };
    for (let y = 0; y < resolution; y += 1) for (let x = 0; x < resolution; x += 1) {
      if (explored[y]![x]) {
        context.fillStyle = "rgba(5,13,20,0.02)";
      } else {
        // Unexplored ground is thin mist over the terrain, not a tarp over a
        // void. The fill lets coastlines and hills ghost through (entities and
        // props are exploration-gated elsewhere, so nothing leaks), and the
        // frontier lightens over two bands so the known world fades into the
        // unknown. Hash-derived per-texel noise keeps it weather, not paint.
        const seed = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        const drift = (seed >>> 8) % 13 - 6;
        const depth = frontierDepth(x, y);
        const [r, g, b, alpha] = depth === 1 ? [104, 124, 152, 0.34]
          : depth === 2 ? [74, 92, 120, 0.46]
          : [48, 64, 90, 0.62];
        context.fillStyle = `rgba(${r + drift},${g + drift},${b + drift},${(alpha + (seed % 7) * 0.012).toFixed(3)})`;
      }
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
    // Exploration changed: the scatter's fog gate must follow the new mask.
    refreshPropInstances();
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

  const clearProps = () => {
    for (const set of propSets) for (const mesh of set.meshes) { environment.remove(mesh); mesh.dispose(); }
    propSets = [];
  };

  /** The fog gate for the scatter: instances exist only for explored cells,
   *  because a tree pokes above the fog sheet and would leak unexplored
   *  terrain. Buffers are rewritten in place — the survivors are not
   *  contiguous, and 5200 matrix writes cost under a millisecond, not a
   *  rebuild. */
  const UP = new THREE.Vector3(0, 1, 0);
  const refreshPropInstances = () => {
    if (!loaded) return;
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const placementMatrix = new THREE.Matrix4();
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    for (const set of propSets) {
      let count = 0;
      for (const placement of set.placements) {
        if (!exploredAt(Math.round(placement.x), Math.round(placement.y))) continue;
        position.set(worldX(placement.x), placement.height, worldZ(placement.y));
        quaternion.setFromAxisAngle(UP, placement.rotation);
        scale.setScalar(placement.scale);
        placementMatrix.compose(position, quaternion, scale);
        // One shared tint axis: brightness runs 0.88–1.12, with a slight
        // warm/cool split so a monoculture of clones reads as varied growth.
        const shade = 0.88 + placement.tint * 0.24;
        const warmth = (placement.tint - 0.5) * 0.1;
        color.setRGB(shade * (1 + warmth), shade, shade * (1 - warmth));
        for (let index = 0; index < set.meshes.length; index += 1) {
          matrix.multiplyMatrices(placementMatrix, set.sourceMatrices[index]!);
          set.meshes[index]!.setMatrixAt(count, matrix);
          set.meshes[index]!.setColorAt(count, color);
        }
        count += 1;
      }
      for (const mesh of set.meshes) {
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  };

  /** Build the instanced scatter from grounded placements. One InstancedMesh
   *  per source mesh of each prop GLB, sharing the template's geometry and
   *  material — draw calls scale with asset variety, not prop count, which is
   *  the whole reason the world can afford a forest instead of a handful of
   *  trees. */
  const buildProps = () => {
    if (!loaded || !heightfield) return;
    clearProps();
    const grounded = new Map<PropAssetKey, GroundedProp[]>();
    for (const placement of scatterProps({ extent: mapExtent, budget: tier.propBudget, biomeAt: terrainAt })) {
      const height = heightfield.sample(worldX(placement.x), worldZ(placement.y));
      // No height sample is open water; just above the waterline is beach.
      // Neither should grow anything.
      if (height === undefined || height < -0.4) continue;
      const list = grounded.get(placement.asset) ?? [];
      list.push({ ...placement, height });
      grounded.set(placement.asset, list);
    }
    for (const [assetKey, placements] of grounded) {
      const template = loaded.get(propAssetSources[assetKey])!;
      template.updateMatrixWorld(true);
      const sources: THREE.Mesh[] = [];
      template.traverse(child => { if (child instanceof THREE.Mesh) sources.push(child); });
      if (!sources.length) continue;
      const meshes = sources.map(source => {
        const instanced = new THREE.InstancedMesh(source.geometry, source.material, placements.length);
        instanced.castShadow = tier.propShadows;
        instanced.receiveShadow = true;
        environment.add(instanced);
        return instanced;
      });
      propSets.push({ placements, meshes, sourceMatrices: sources.map(source => source.matrixWorld.clone()) });
    }
    refreshPropInstances();
  };

  const clearRoads = () => {
    for (const child of [...roadLayer.children]) {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
      }
      roadLayer.remove(child);
    }
  };

  /** Trade roads: hub spokes plus a fallback tie per stranded city, laid as
   *  terrain-following ribbons. Segments that would wade through open water
   *  are dropped — a road into the sea reads as a bug, not a route — and the
   *  layer is rebuilt only when the set of surviving segments changes. */
  const rebuildRoads = () => {
    if (!loaded || !heightfield) return;
    const cities: RoadEndpoint[] = [];
    for (const city of latest.cities) {
      if (city.playerId === ownPlayerId || exploredAt(city.x, city.y)) cities.push({ id: city.id, x: city.x, y: city.y });
    }
    const hubs: RoadEndpoint[] = [];
    for (const hub of latest.logistics.marketHubs) {
      if (exploredAt(hub.x, hub.y)) hubs.push({ id: hub.id, x: hub.x, y: hub.y });
    }
    const buildable: Array<RoadSegment & { points: THREE.Vector3[] }> = [];
    for (const segment of planRoads(cities, hubs)) {
      const points: THREE.Vector3[] = [];
      let waterSamples = 0;
      let totalSamples = 0;
      const steps = Math.max(2, Math.ceil(Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y) * CELL_SIZE / 6));
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const x = segment.from.x + (segment.to.x - segment.from.x) * t;
        const y = segment.from.y + (segment.to.y - segment.from.y) * t;
        const height = heightfield.sample(worldX(x), worldZ(y));
        totalSamples += 1;
        if (height === undefined || height < -0.45) { waterSamples += 1; continue; }
        points.push(new THREE.Vector3(worldX(x), height + 0.12, worldZ(y)));
      }
      if (waterSamples / totalSamples > 0.3 || points.length < 2) continue;
      buildable.push({ ...segment, points });
    }
    const signature = buildable.map(segment => segment.key).sort().join(";");
    if (signature === roadSignature) return;
    roadSignature = signature;
    clearRoads();
    if (!buildable.length) return;
    const material = new THREE.MeshStandardMaterial({ color: 0xb99c6d, roughness: 1, metalness: 0 });
    for (const segment of buildable) {
      const ribbon = groundRibbon(segment.points, 2.2, material);
      if (ribbon) {
        ribbon.receiveShadow = true;
        roadLayer.add(ribbon);
      }
    }
  };

  const removeEntity = (id: string) => {
    const root = entityRoots.get(id);
    if (root) { clearGroup(root); entityLayer.remove(root); }
    const label = entityLabels.get(id);
    if (label) {
      // A dot label borrows the shared per-tone texture; only a chip owns its own.
      if (label.userData.ownsMap) label.material.map?.dispose();
      label.material.dispose();
      labelLayer.remove(label);
    }
    entityRoots.delete(id);
    entityLabels.delete(id);
    entitySignatures.delete(id);
    entityChips.delete(id);
  };

  const setEntity = (id: string, signature: string, create: () => THREE.Group, x: number, y: number, chip?: ChipEntity) => {
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
    if (chip) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
      sprite.scale.set(24, 4.5, 1);
      sprite.renderOrder = 50;
      sprite.userData.label = true;
      // The player's own city chip carries their nameplate cosmetic's colour —
      // the one place a nameplate still shows on the world map now that labels
      // are chips.
      if (chip.kind === "city" && chip.own) sprite.userData.toneColor = nameplateColor(equipped);
      applyChipPlan(sprite, chipFor(chip, cameraZoom, tier.labelStyle), sprite.userData.toneColor);
      sprite.position.copy(positionAt(x, y, 11));
      sprite.userData.entityId = id;
      labelLayer.add(sprite);
      entityLabels.set(id, sprite);
      entityChips.set(id, chip);
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
      setEntity(id, mission.kind, () => missionModel(loaded!, mission.kind), mission.target.x, mission.target.y, { kind: "mission", title: mission.title });
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
      setEntity(`city:${city.id}`, `${city.visibility}:${city.factionId}:${label}:${ownCosmetics?.flag_color ?? ""}:${ownCosmetics?.nameplate ?? ""}`, () => cityModel(loaded!, visibleCity, ownPlayerId, ownCosmetics), city.x, city.y, { kind: "city", name: city.name, own: city.playerId === ownPlayerId, unknown: visibleCity.visibility === "unknown" });
    }
    for (const node of latest.logistics.resourceNodes) {
      if (!exploredAt(node.x, node.y)) continue;
      visible.add(`node:${node.id}`);
      setEntity(`node:${node.id}`, node.resourceType, () => cloneAsset(loaded!, node.resourceType === "wood" ? "tree" : "rock", node.resourceType === "wood" ? 2.35 : 1.9), node.x, node.y);
    }
    for (const hub of latest.logistics.marketHubs) {
      if (!exploredAt(hub.x, hub.y)) continue;
      visible.add(`hub:${hub.id}`);
      setEntity(`hub:${hub.id}`, `${hub.name}:post`, () => hubModel(loaded!), hub.x, hub.y, { kind: "hub", name: hub.name });
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
      setEntity(`caravan:${caravan.id}`, "cart", () => cloneAsset(loaded!, "cart", 1.55), x, y, { kind: "caravan", own: caravan.ownerPlayerId === ownPlayerId });
    }
    for (const army of latest.armies) {
      if (army.strength <= 0) continue;
      if (army.ownerPlayerId !== ownPlayerId && !exploredAt(army.x, army.y)) continue;
      visible.add(`army:${army.id}`);
      setEntity(`army:${army.id}`, String(army.strength), () => cloneAsset(loaded!, "soldier", 2.15), army.x, army.y, { kind: "army", strength: army.strength, own: army.ownerPlayerId === ownPlayerId });
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
      missionBeacon.position.copy(positionAt(nextGroundMission.target.x, nextGroundMission.target.y, 17));
      missionBeacon.visible = tier.beacon === "beam";
    } else {
      missionLine.visible = false;
      missionBeacon.visible = false;
    }
    rebuildRoads();
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
    enrichTerrainColors(terrainRoot);
    scene.add(terrainRoot);
    terrainLod1Root = cloneAsset(loaded, "terrainLod1", 1);
    terrainLod1Root.name = "authored-world-terrain-lod1-glb";
    enrichTerrainColors(terrainLod1Root);
    scene.add(terrainLod1Root);
    terrainRoot.updateMatrixWorld(true);
    // The heightfield is binned from the terrain template's own vertices: the
    // analytic terrainHeight knows biomes, not coastlines, and both the scatter
    // and the roads need to know where the sea starts.
    const terrainTemplate = loaded.get("terrain")!;
    terrainTemplate.updateMatrixWorld(true);
    const vertices: number[] = [];
    terrainTemplate.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const attribute = child.geometry.getAttribute("position");
      if (!attribute) return;
      const vertex = new THREE.Vector3();
      for (let index = 0; index < attribute.count; index += 1) {
        vertex.fromBufferAttribute(attribute, index).applyMatrix4(child.matrixWorld);
        vertices.push(vertex.x, vertex.y, vertex.z);
      }
    });
    heightfield = buildHeightfield({ positions: new Float32Array(vertices), worldSize: WORLD_SIZE, size: 256 });
    buildProps();
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
    composer?.setSize(width, height);
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
    // The sun keeps its angle but not its spot: the shadow frustum follows the
    // camera so wherever the player looks is wherever shadows exist.
    sun.position.copy(cameraTarget).add(sunOffset);
    sun.target.position.copy(cameraTarget);
    renderer.domElement.dataset.worldZoom = cameraZoom.toFixed(3);
    // Pan probe: e2e and .devflow probes assert map liveness by watching these
    // two datasets — zoom answers the wheel, pan answers the drag.
    renderer.domElement.dataset.worldPan = `${cameraTarget.x.toFixed(1)},${cameraTarget.y.toFixed(1)}`;
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
      const elapsed = clock.getElapsedTime();
      const pulse = 0.78 + Math.sin(elapsed * 2.1) * 0.12;
      if (tier.waterAnimation) waterUniforms.uTime.value = elapsed;
      if (missionBeacon.visible) missionBeaconMaterial.opacity = 0.3 + Math.sin(elapsed * 1.7) * 0.12;
      for (const root of entityRoots.values()) {
        const ring = root.children.find(child => child instanceof THREE.Mesh && child.geometry instanceof THREE.RingGeometry) as THREE.Mesh | undefined;
        const entityId = String(root.userData.entityId ?? "");
        if (ring) {
          ring.visible = entityId.startsWith("seat:") || entityId.startsWith("mission:") ||
            (selected?.kind === "city" && entityId === "city:" + selected.id);
        }
        if (ring) (ring.material as THREE.MeshBasicMaterial).opacity = pulse;
      }
      // The scatter stays visible at every zoom: instancing made its draw
      // cost constant in prop count, and a map that empties out when zoomed
      // out was the single biggest "there is nothing here" complaint.
      const labelScale = THREE.MathUtils.clamp(1.25 / cameraZoom, 0.32, 2.9);
      // The selected entity's label always reads at the fullest tier the style
      // allows: zoom decides how much ink a passer-by gets, not what the player
      // is currently looking at.
      const selectedLabelId = selected?.kind === "city" ? `city:${selected.id}` : selected?.kind === "army" ? `army:${selected.id}` : undefined;
      for (const [id, label] of entityLabels) {
        const chip = entityChips.get(id);
        if (chip) applyChipPlan(label, chipFor(chip, id === selectedLabelId ? CHIP_TEXT_ZOOM : cameraZoom, tier.labelStyle), label.userData.toneColor as string | undefined);
        if (label.userData.isDot) label.scale.set(6.4 * labelScale, 6.4 * labelScale, 1);
        else label.scale.set(24 * labelScale, 4.5 * labelScale, 1);
        label.visible = cameraZoom > 0.28;
      }
      if (terrainRoot && terrainLod1Root) {
        const useDetailedTerrain = cameraZoom > 0.22;
        terrainRoot.visible = useDetailedTerrain;
        terrainLod1Root.visible = !useDetailedTerrain;
      }
      if (composer) composer.render();
      else renderer.render(scene, camera);
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
      stopRendering();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      // An InstancedMesh's instance buffers are neither geometry nor material,
      // so the scene sweep below would leave them on the GPU.
      for (const set of propSets) for (const mesh of set.meshes) mesh.dispose();
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
      missionBeacon.geometry.dispose();
      missionBeaconMaterial.dispose();
      for (const texture of dotTextureCache.values()) texture.dispose();
      dotTextureCache.clear();
      composer?.dispose();
      if (loaded) disposeAssets(loaded);
      loaded = undefined;
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
