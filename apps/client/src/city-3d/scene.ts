import * as THREE from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import {
  buildingDimensions,
  buildingOccupiedTiles,
  cityRotations,
  isPlacementWithinBounds,
} from "@kingdoms/shared";
import type { BuildingId, BuildingPlacement, CityRotation, EquippedCosmetics, FactionId } from "@kingdoms/shared";
import { CITY_ASSET_SET_ID, cityBuildingVisuals, type CityAssetKey } from "./manifest.js";
import { cloneCityAsset, getLoadedAsset } from "./loader.js";
import { graphicsDpr } from "../graphics.js";
import { isModalOpen } from "../ui/Modal.js";
import type { CityBuildingState, CitySceneInstance, CitySceneOptions } from "./types.js";

const CELL_SIZE = 2;
const ROAD_Y = 0.045;

type Transform = { position: THREE.Vector3; rotation?: number; scale?: number };
type CitizenState = { group: THREE.Group; path: THREE.Vector3[]; index: number; direction: 1 | -1; speed: number };
type RoomStyle = "stone" | "wood";
type RoofStyle = "red" | "green" | "flat";

const factionThemes: Record<FactionId, {
  civicStyle: RoomStyle;
  militaryStyle: RoomStyle;
  primaryRoof: RoofStyle;
  secondaryRoof: RoofStyle;
  banner: "fantasy.banner-green" | "fantasy.banner-red";
}> = {
  meridian: { civicStyle: "stone", militaryStyle: "wood", primaryRoof: "red", secondaryRoof: "green", banner: "fantasy.banner-green" },
  bastion: { civicStyle: "stone", militaryStyle: "stone", primaryRoof: "flat", secondaryRoof: "red", banner: "fantasy.banner-red" },
  ravager: { civicStyle: "wood", militaryStyle: "wood", primaryRoof: "red", secondaryRoof: "flat", banner: "fantasy.banner-red" },
  veiled: { civicStyle: "wood", militaryStyle: "stone", primaryRoof: "green", secondaryRoof: "green", banner: "fantasy.banner-green" },
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFrom(seedValue: string) {
  let seed = hashString(seedValue);
  return () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function markOwned(mesh: THREE.Mesh, disposeGeometry = true): THREE.Mesh {
  mesh.userData.cityOwnedGeometry = disposeGeometry;
  mesh.userData.cityOwnedMaterial = true;
  return mesh;
}

function clearGroup(group: THREE.Group): void {
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.userData.cityOwnedGeometry) object.geometry.dispose();
    if (!object.userData.cityOwnedMaterial) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
  group.clear();
}

function addAsset(
  parent: THREE.Object3D,
  key: CityAssetKey,
  position: [number, number, number] = [0, 0, 0],
  rotation = 0,
  scale = 1,
): THREE.Group {
  const object = cloneCityAsset(key);
  object.position.set(...position);
  object.rotation.y = rotation;
  object.scale.setScalar(scale);
  object.userData.cityAssetKey = key;
  parent.add(object);
  return object;
}

function cosmeticFlagColor(equipped: EquippedCosmetics | undefined): number | undefined {
  if (equipped?.flag_color === "flag_ember") return 0xd56a45;
  if (equipped?.flag_color === "flag_sea") return 0x268ea5;
  return undefined;
}

function tintAsset(root: THREE.Object3D, color: number): void {
  const target = new THREE.Color(color);
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const source = Array.isArray(object.material) ? object.material : [object.material];
    const materials = source.map(material => {
      const clone = material.clone();
      if (clone instanceof THREE.MeshStandardMaterial) clone.color.lerp(target, 0.55);
      return clone;
    });
    object.material = Array.isArray(object.material) ? materials : materials[0]!;
    object.userData.cityOwnedMaterial = true;
  });
}

function addInstancedAsset(parent: THREE.Object3D, key: CityAssetKey, transforms: Transform[]): void {
  if (!transforms.length) return;
  const source = getLoadedAsset(key).scene;
  source.updateMatrixWorld(true);
  source.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh) return;
    const instances = new THREE.InstancedMesh(object.geometry, object.material, transforms.length);
    instances.castShadow = object.castShadow;
    instances.receiveShadow = object.receiveShadow;
    instances.userData.cityAssetKey = key;
    const base = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    transforms.forEach((transform, index) => {
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), transform.rotation ?? 0);
      scale.setScalar(transform.scale ?? 1);
      base.compose(transform.position, rotation, scale);
      instances.setMatrixAt(index, base.clone().multiply(object.matrixWorld));
    });
    instances.instanceMatrix.needsUpdate = true;
    parent.add(instances);
  });
}

function addRoom(
  parent: THREE.Object3D,
  x: number,
  z: number,
  storeys: number,
  style: "stone" | "wood",
  roof: "red" | "green" | "flat",
  door = true,
): void {
  const wall = style === "stone" ? "fantasy.wall-stone" : "fantasy.wall-wood";
  const wallDoor = style === "stone" ? "fantasy.wall-stone-door" : "fantasy.wall-wood-door";
  const wallWindow = style === "stone" ? "fantasy.wall-stone-window" : "fantasy.wall-wood-window";
  for (let y = 0; y < storeys; y += 1) {
    const front = y === 0 && door ? wallDoor : wallWindow;
    addAsset(parent, front, [x, y, z], -Math.PI / 2);
    addAsset(parent, wallWindow, [x, y, z], Math.PI / 2);
    addAsset(parent, y === 0 ? wall : wallWindow, [x, y, z], 0);
    addAsset(parent, y === 0 ? wall : wallWindow, [x, y, z], Math.PI);
  }
  const roofKey: CityAssetKey = roof === "green"
    ? "fantasy.roof-green"
    : roof === "flat"
      ? "fantasy.roof-flat"
      : "fantasy.roof-red";
  addAsset(parent, roofKey, [x, storeys, z]);
}

function createScaffold(parent: THREE.Object3D, radius: number): void {
  for (const side of [-1, 1]) {
    addAsset(parent, "fantasy.poles", [side * radius, 0.1, 0], side < 0 ? Math.PI : 0, 1.15);
    addAsset(parent, "fantasy.planks", [side * radius, 0.62, 0], Math.PI / 2, 1.15);
  }
}

function createBuildingVisual(building: CityBuildingState, factionId: FactionId): THREE.Group {
  const group = new THREE.Group();
  const levelBand = Math.min(building.level, 3);
  const theme = factionThemes[factionId];

  if (building.buildingId === "town_hall") {
    addRoom(group, -0.78, 0.08, 1, theme.civicStyle, theme.primaryRoof, false);
    addRoom(group, 0.78, 0.08, 1, theme.civicStyle, theme.primaryRoof, true);
    addAsset(group, "castle.tower", [0, 0, -0.48], 0, 1.05);
    addAsset(group, "castle.tower-roof", [0, 1.31, -0.48], 0, 1.05);
    addAsset(group, "fantasy.stairs-stone", [0, 0, 0.78], -Math.PI / 2, 1.2);
    if (levelBand >= 2) {
      addRoom(group, 0, -1.08, 2, theme.civicStyle, theme.secondaryRoof, false);
      addAsset(group, "castle.banner", [-0.72, 1.2, 0.5], 0, 0.82);
      addAsset(group, "castle.banner", [0.72, 1.2, 0.5], 0, 0.82);
    }
    if (levelBand >= 3) addAsset(group, "castle.flag", [0, 2.55, -1.08], 0, 0.9);
  } else if (building.buildingId === "warehouse") {
    addRoom(group, -0.48, 0, 1, "wood", theme.primaryRoof, true);
    addRoom(group, 0.48, 0, 1, theme.civicStyle, levelBand >= 2 ? theme.secondaryRoof : theme.primaryRoof, false);
    addAsset(group, "fantasy.cart", [0.35, 0, 0.78], Math.PI / 2, 0.72);
    addAsset(group, "fantasy.overhang", [-0.45, 0.2, 0.62], -Math.PI / 2, 0.85);
    if (levelBand >= 2) addAsset(group, "fantasy.chimney", [0.42, 1.05, -0.08], 0, 0.78);
    if (levelBand >= 3) addAsset(group, theme.banner, [-0.78, 0.55, 0.45], 0, 0.7);
  } else if (building.buildingId === "road_depot") {
    addRoom(group, -0.72, -0.18, 1, "wood", theme.secondaryRoof, true);
    addRoom(group, 0.25, -0.18, levelBand >= 2 ? 2 : 1, theme.civicStyle, theme.primaryRoof, false);
    addAsset(group, "fantasy.cart", [0.78, 0, 0.65], Math.PI / 2, 0.85);
    addAsset(group, "fantasy.stall-green", [-0.75, 0, 0.76], 0, 0.8);
    if (levelBand >= 2) addAsset(group, theme.banner, [0.72, 0.6, 0.34], 0, 0.78);
    if (levelBand >= 3) addAsset(group, "castle.flag", [0.25, 2.15, -0.18], 0, 0.72);
  } else if (building.buildingId === "barracks") {
    addRoom(group, -0.7, -0.34, 1, theme.militaryStyle, theme.primaryRoof, true);
    addRoom(group, 0.7, -0.34, 1, theme.militaryStyle, theme.primaryRoof, false);
    addAsset(group, "castle.tower", [-0.95, 0, 0.62], 0, 0.8);
    addAsset(group, "castle.tower", [0.95, 0, 0.62], 0, 0.8);
    addAsset(group, "castle.metal-gate", [0, 0, 0.72], 0, 0.86);
    addAsset(group, theme.banner, [-0.58, 0.72, 0.66], 0, 0.78);
    addAsset(group, theme.banner, [0.58, 0.72, 0.66], 0, 0.78);
    if (levelBand >= 2) addRoom(group, 0, -0.85, 2, theme.militaryStyle, theme.secondaryRoof, false);
    if (levelBand >= 3) addAsset(group, "castle.flag", [0, 2.18, -0.85], 0, 0.78);
  } else if (building.buildingId === "farm") {
    addRoom(group, -0.45, 0, 1, "wood", theme.primaryRoof, true);
    addAsset(group, "fantasy.stall-green", [0.55, 0, 0.25], 0, 0.85);
    addAsset(group, "fantasy.fence", [0.55, 0, -0.62], 0, 0.75);
    if (levelBand >= 2) addAsset(group, "fantasy.tree", [0.72, 0, 0.72], 0, 0.68);
    if (levelBand >= 3) addAsset(group, theme.banner, [-0.5, 0.72, 0.32], 0, 0.68);
  } else if (building.buildingId === "lumber_mill") {
    addRoom(group, -0.6, -0.1, 1, "wood", theme.secondaryRoof, true);
    addAsset(group, "fantasy.planks", [0.55, 0.15, 0.45], 0, 0.9);
    addAsset(group, "fantasy.cart", [0.65, 0, -0.52], Math.PI / 2, 0.72);
    if (levelBand >= 2) addAsset(group, "fantasy.tree-crooked", [0.75, 0, 0.7], 0, 0.72);
    if (levelBand >= 3) addAsset(group, "castle.flag", [0, 1.65, -0.2], 0, 0.66);
  } else if (building.buildingId === "stone_quarry") {
    addRoom(group, -0.55, -0.05, 1, theme.civicStyle, theme.primaryRoof, true);
    addAsset(group, "fantasy.rock-large", [0.58, 0, 0.42], 0, 0.78);
    addAsset(group, "fantasy.rock-small", [0.72, 0, -0.45], 0, 0.62);
    if (levelBand >= 2) addAsset(group, "fantasy.rock-large", [0.55, 0, -0.65], 0, 0.56);
    if (levelBand >= 3) addAsset(group, theme.banner, [-0.52, 0.72, 0.35], 0, 0.68);
  } else if (building.buildingId === "academy") {
    addRoom(group, -0.52, 0, levelBand >= 2 ? 2 : 1, theme.civicStyle, theme.primaryRoof, true);
    addAsset(group, "castle.tower", [0.62, 0, 0.12], 0, 0.82);
    addAsset(group, "castle.tower-roof", [0.62, 1.05 + (levelBand >= 2 ? 1.15 : 0), 0.12], 0, 0.82);
    if (levelBand >= 3) addAsset(group, "castle.flag", [0.62, 2.35, 0.12], 0, 0.7);
  } else {
    addRoom(group, -0.62, 0, 1, theme.civicStyle, theme.primaryRoof, true);
    addRoom(group, 0.48, 0, levelBand >= 2 ? 2 : 1, "wood", theme.secondaryRoof, false);
    addAsset(group, "fantasy.lantern", [0.02, 0.75, 0.7], 0, 0.72);
    if (levelBand >= 2) addAsset(group, theme.banner, [-0.55, 0.7, 0.32], 0, 0.68);
    if (levelBand >= 3) addAsset(group, "castle.flag", [0.48, 2.3, 0], 0, 0.7);
  }

  group.scale.setScalar(cityBuildingVisuals[building.buildingId].scale);
  return group;
}

function occupiedCells(buildings: CityBuildingState[], exclude?: BuildingId): Set<string> {
  const occupied = new Set<string>();
  for (const building of buildings) {
    if (building.buildingId === exclude) continue;
    for (const tile of buildingOccupiedTiles(building)) occupied.add(`${tile.x},${tile.y}`);
  }
  return occupied;
}

function approachCells(building: CityBuildingState, size: number): Array<{ x: number; y: number }> {
  const dims = buildingDimensions(building.buildingId, building.rotation);
  const cells: Array<{ x: number; y: number }> = [];
  for (let x = building.x; x < building.x + dims.width; x += 1) {
    cells.push({ x, y: building.y - 1 }, { x, y: building.y + dims.height });
  }
  for (let y = building.y; y < building.y + dims.height; y += 1) {
    cells.push({ x: building.x - 1, y }, { x: building.x + dims.width, y });
  }
  return cells.filter(cell => cell.x >= 0 && cell.y >= 0 && cell.x < size && cell.y < size);
}

function findRoadPath(
  size: number,
  starts: Array<{ x: number; y: number }>,
  goals: Array<{ x: number; y: number }>,
  blocked: Set<string>,
): Array<{ x: number; y: number }> {
  const queue = [...starts];
  const previous = new Map<string, string | null>();
  for (const start of starts) previous.set(`${start.x},${start.y}`, null);
  const goalKeys = new Set(goals.map(goal => `${goal.x},${goal.y}`));
  let reached: string | null = null;
  for (let index = 0; index < queue.length; index += 1) {
    const cell = queue[index];
    const key = `${cell.x},${cell.y}`;
    if (goalKeys.has(key)) { reached = key; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: cell.x + dx, y: cell.y + dy };
      const nextKey = `${next.x},${next.y}`;
      if (next.x < 0 || next.y < 0 || next.x >= size || next.y >= size) continue;
      if (blocked.has(nextKey) || previous.has(nextKey)) continue;
      previous.set(nextKey, key);
      queue.push(next);
    }
  }
  if (!reached) return [];
  const path: Array<{ x: number; y: number }> = [];
  for (let cursor: string | null = reached; cursor; cursor = previous.get(cursor) ?? null) {
    const [x, y] = cursor.split(",").map(Number);
    path.push({ x, y });
  }
  return path.reverse();
}

function roadRibbon(points: THREE.Vector3[], width: number, material: THREE.Material): THREE.Mesh | null {
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
    positions.push(point.x + normal.x, ROAD_Y, point.z + normal.z, point.x - normal.x, ROAD_Y, point.z - normal.z);
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
  const mesh = markOwned(new THREE.Mesh(geometry, material));
  mesh.receiveShadow = true;
  return mesh;
}

export function createCityScene(container: HTMLElement, initialOptions: CitySceneOptions): CitySceneInstance {
  let options = { ...initialOptions };
  let destroyed = false;
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: options.quality !== "low", powerPreference: "high-performance" });
  renderer.setSize(width, height);
  renderer.setPixelRatio(graphicsDpr(options.quality === "medium" ? "balanced" : options.quality));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  renderer.shadowMap.enabled = options.quality !== "low";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.dataset.cityAssetSet = CITY_ASSET_SET_ID;
  renderer.domElement.dataset.cityGrid = "hidden";
  renderer.domElement.dataset.cityFaction = options.factionId;
  renderer.domElement.dataset.cityFlagColor = options.equipped?.flag_color ?? "default";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfd4df);
  scene.fog = null;
  const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 1, 220);
  const cameraTarget = new THREE.Vector3(options.gridSize, 0, options.gridSize);
  const isoDirection = new THREE.Vector3(1, 1.18, 1).normalize();
  let zoomFrustum = Math.max(30, options.gridSize * 2.8);
  const minZoom = 16;
  const maxZoom = 54;

  const sun = new THREE.DirectionalLight(0xfff1d0, 1.45);
  sun.position.set(45, 65, 30);
  sun.castShadow = options.quality !== "low";
  sun.shadow.mapSize.set(options.quality === "high" ? 2048 : 1024, options.quality === "high" ? 2048 : 1024);
  sun.shadow.camera.left = -38;
  sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 38;
  sun.shadow.camera.bottom = -38;
  sun.shadow.bias = -0.00035;
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xddeeff, 0x5b6843, 0.72));

  const groundGroup = new THREE.Group();
  const roadGroup = new THREE.Group();
  const wallsGroup = new THREE.Group();
  const buildingsGroup = new THREE.Group();
  const propsGroup = new THREE.Group();
  const citizensGroup = new THREE.Group();
  const overlayGroup = new THREE.Group();
  scene.add(groundGroup, roadGroup, wallsGroup, buildingsGroup, propsGroup, citizensGroup, overlayGroup);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const colliders: THREE.Object3D[] = [];
  const buildingMeshes = new Map<BuildingId, THREE.Group>();
  const mixers: THREE.AnimationMixer[] = [];
  const citizens: CitizenState[] = [];
  let walkPaths: THREE.Vector3[][] = [];
  let roadCellKeys = new Set<string>();
  let placementIsValid = false;

  function updateProjection(): void {
    const viewportWidth = container.clientWidth || window.innerWidth;
    const viewportHeight = container.clientHeight || window.innerHeight;
    renderer.setSize(viewportWidth, viewportHeight);
    const aspect = viewportWidth / viewportHeight;
    camera.left = (-zoomFrustum * aspect) / 2;
    camera.right = (zoomFrustum * aspect) / 2;
    camera.top = zoomFrustum / 2;
    camera.bottom = -zoomFrustum / 2;
    camera.position.copy(cameraTarget).addScaledVector(isoDirection, 85);
    camera.lookAt(cameraTarget);
    camera.updateProjectionMatrix();
  }
  updateProjection();

  function buildGround(): void {
    clearGroup(groundGroup);
    const cityWorldSize = options.gridSize * CELL_SIZE;
    const terrainSize = Math.max(86, cityWorldSize + 58);
    const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, 52, 52);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute("position");
    const colors: number[] = [];
    const rng = randomFrom(`${options.cityId}:terrain:${options.gridSize}`);
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const outside = Math.max(Math.abs(x) - cityWorldSize / 2 - 3, Math.abs(z) - cityWorldSize / 2 - 3, 0);
      const wave = Math.sin(x * 0.31) * Math.cos(z * 0.27) + Math.sin((x + z) * 0.14);
      position.setY(i, outside > 0 ? wave * Math.min(0.55, outside * 0.045) : wave * 0.018);
      const shade = 0.82 + rng() * 0.16 + Math.min(outside / 120, 0.08);
      colors.push(0.34 * shade, 0.52 * shade, 0.25 * shade);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0 });
    const terrain = markOwned(new THREE.Mesh(geometry, material));
    terrain.position.set(cityWorldSize / 2, -0.035, cityWorldSize / 2);
    terrain.receiveShadow = true;
    groundGroup.add(terrain);

    const boundaryGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.07, 0), new THREE.Vector3(cityWorldSize, 0.07, 0),
      new THREE.Vector3(cityWorldSize, 0.07, cityWorldSize), new THREE.Vector3(0, 0.07, cityWorldSize),
    ]);
    const boundaryMaterial = new THREE.LineBasicMaterial({ color: 0xf4d47b, transparent: true, opacity: 0.62 });
    const boundary = new THREE.LineLoop(boundaryGeometry, boundaryMaterial);
    boundary.userData.cityOwnedGeometry = true;
    boundary.userData.cityOwnedMaterial = true;
    boundary.visible = options.mode !== "view";
    boundary.name = "build-boundary";
    groundGroup.add(boundary);
  }

  function buildWalls(): void {
    clearGroup(wallsGroup);
    const size = options.gridSize * CELL_SIZE;
    const gate = Math.floor(options.gridSize / 2);
    const segments: Transform[] = [];
    for (let index = 0; index < options.gridSize; index += 1) {
      const coordinate = (index + 0.5) * CELL_SIZE;
      segments.push({ position: new THREE.Vector3(coordinate, 0, 0), rotation: 0, scale: 1.92 });
      segments.push({ position: new THREE.Vector3(0, 0, coordinate), rotation: Math.PI / 2, scale: 1.92 });
      segments.push({ position: new THREE.Vector3(size, 0, coordinate), rotation: Math.PI / 2, scale: 1.92 });
      if (index !== gate) segments.push({ position: new THREE.Vector3(coordinate, 0, size), rotation: 0, scale: 1.92 });
    }
    addInstancedAsset(wallsGroup, "castle.wall", segments);
    for (const [x, z, rotation] of [[0, 0, 0], [size, 0, Math.PI / 2], [size, size, Math.PI], [0, size, -Math.PI / 2]] as const) {
      addAsset(wallsGroup, "castle.tower", [x, 0, z], rotation, 2.15);
      addAsset(wallsGroup, "castle.tower-roof", [x, 2.8, z], rotation, 2.15);
    }
    addAsset(wallsGroup, "castle.wall-gate", [(gate + 0.5) * CELL_SIZE, 0, size], 0, 2.25);
    const banner = factionThemes[options.factionId].banner;
    const flagTint = cosmeticFlagColor(options.equipped);
    const addBanner = (position: [number, number, number]) => {
      const asset = addAsset(wallsGroup, banner, position, 0, 0.9);
      if (flagTint) tintAsset(asset, flagTint);
    };
    const flag = addAsset(wallsGroup, "castle.flag", [(gate + 0.5) * CELL_SIZE, 2.5, size], 0, 1.15);
    if (flagTint) tintAsset(flag, flagTint);
    addBanner([(gate - 0.35) * CELL_SIZE, 0.82, size - 0.12]);
    addBanner([(gate + 1.35) * CELL_SIZE, 0.82, size - 0.12]);
    if (options.factionId === "bastion") {
      for (let index = 2; index < options.gridSize - 1; index += 3) {
        addAsset(wallsGroup, "castle.wall-pillar", [(index + 0.5) * CELL_SIZE, 0, 0], 0, 2.05);
        addAsset(wallsGroup, "castle.wall-pillar", [(index + 0.5) * CELL_SIZE, 0, size], 0, 2.05);
      }
    }
    if (options.factionId === "ravager") {
      addAsset(wallsGroup, "fantasy.fence", [size * 0.25, 0, size - 1.5], 0, 1.4);
      addAsset(wallsGroup, "fantasy.fence", [size * 0.75, 0, size - 1.5], Math.PI, 1.4);
    }
  }

  function buildBuildings(): void {
    clearGroup(buildingsGroup);
    colliders.length = 0;
    buildingMeshes.clear();
    for (const building of options.buildings) {
      const placement = new THREE.Group();
      placement.name = `building-${building.buildingId}`;
      const visual = createBuildingVisual(building, options.factionId);
      placement.add(visual);
      const baseDims = buildingDimensions(building.buildingId, 0);
      const rotatedDims = buildingDimensions(building.buildingId, building.rotation);
      const worldX = (building.x + rotatedDims.width / 2) * CELL_SIZE;
      const worldZ = (building.y + rotatedDims.height / 2) * CELL_SIZE;
      placement.position.set(worldX, 0, worldZ);
      placement.rotation.y = (building.rotation * Math.PI) / 180;

      const collider = markOwned(new THREE.Mesh(
        new THREE.BoxGeometry(baseDims.width * CELL_SIZE * 0.92, 4.6, baseDims.height * CELL_SIZE * 0.92),
        new THREE.MeshBasicMaterial({ visible: false }),
      ));
      collider.position.y = 2.1;
      collider.userData.buildingId = building.buildingId;
      placement.add(collider);
      colliders.push(collider);

      if (building.isUpgrading) createScaffold(placement, Math.max(baseDims.width, baseDims.height) * 0.7);
      if (building.buildingId === options.selectedBuildingId) {
        const ring = markOwned(new THREE.Mesh(
          new THREE.RingGeometry(Math.max(baseDims.width, baseDims.height) * 0.84, Math.max(baseDims.width, baseDims.height) * 1.04, 40),
          new THREE.MeshBasicMaterial({ color: 0xffd76b, transparent: true, opacity: 0.82, side: THREE.DoubleSide }),
        ));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.075;
        placement.add(ring);
      }
      if (options.mode === "edit" && options.placementDraft?.buildingId === building.buildingId) visual.visible = false;
      buildingsGroup.add(placement);
      buildingMeshes.set(building.buildingId, placement);
    }
  }

  function buildRoads(): void {
    clearGroup(roadGroup);
    const blocked = occupiedCells(options.buildings);
    const gateCell = { x: Math.floor(options.gridSize / 2), y: options.gridSize - 1 };
    const roadCells = new Set<string>([`${gateCell.x},${gateCell.y}`]);
    const paths: THREE.Vector3[][] = [];
    const sorted = [...options.buildings].sort((a, b) => Number(b.buildingId === "town_hall") - Number(a.buildingId === "town_hall"));
    for (const building of sorted) {
      const starts = [...roadCells].map(key => {
        const [x, y] = key.split(",").map(Number);
        return { x, y };
      });
      const path = findRoadPath(options.gridSize, starts, approachCells(building, options.gridSize), blocked);
      if (!path.length) continue;
      path.forEach(cell => roadCells.add(`${cell.x},${cell.y}`));
      const points = path.map(cell => new THREE.Vector3((cell.x + 0.5) * CELL_SIZE, ROAD_Y, (cell.y + 0.5) * CELL_SIZE));
      if (building.buildingId === "town_hall") points.unshift(new THREE.Vector3((gateCell.x + 0.5) * CELL_SIZE, ROAD_Y, options.gridSize * CELL_SIZE + 5));
      paths.push(points);
    }
    roadCellKeys = roadCells;
    const material = new THREE.MeshStandardMaterial({ color: 0xb99c6d, roughness: 1, metalness: 0 });
    for (const points of paths) {
      const road = roadRibbon(points, 1.12, material.clone());
      if (road) roadGroup.add(road);
    }
    material.dispose();
    const townHall = options.buildings.find(building => building.buildingId === "town_hall");
    if (townHall) {
      const dims = buildingDimensions(townHall.buildingId, townHall.rotation);
      const plazaMaterial = new THREE.MeshStandardMaterial({ color: 0xcbb58c, roughness: 0.96 });
      const plaza = markOwned(new THREE.Mesh(new THREE.CircleGeometry(3.2, 28), plazaMaterial));
      plaza.rotation.x = -Math.PI / 2;
      plaza.scale.set(1.35, 0.88, 1);
      plaza.position.set((townHall.x + dims.width / 2) * CELL_SIZE, 0.035, (townHall.y + dims.height / 2 + 0.5) * CELL_SIZE);
      plaza.receiveShadow = true;
      roadGroup.add(plaza);
    }
    walkPaths = paths;
  }

  function buildProps(): void {
    clearGroup(propsGroup);
    const rng = randomFrom(`${options.cityId}:decor:${options.gridSize}`);
    const size = options.gridSize * CELL_SIZE;
    const treeGroups: Record<"fantasy.tree" | "fantasy.tree-crooked" | "fantasy.tree-round", Transform[]> = {
      "fantasy.tree": [], "fantasy.tree-crooked": [], "fantasy.tree-round": [],
    };
    const treeKeys = Object.keys(treeGroups) as Array<keyof typeof treeGroups>;
    for (let index = 0; index < (options.quality === "low" ? 24 : 42); index += 1) {
      const edge = Math.floor(rng() * 4);
      const along = -7 + rng() * (size + 14);
      const offset = 3.5 + rng() * 13;
      const position = edge === 0
        ? new THREE.Vector3(along, 0, -offset)
        : edge === 1
          ? new THREE.Vector3(size + offset, 0, along)
          : edge === 2
            ? new THREE.Vector3(along, 0, size + offset)
            : new THREE.Vector3(-offset, 0, along);
      treeGroups[treeKeys[index % treeKeys.length]].push({ position, rotation: rng() * Math.PI * 2, scale: 1.45 + rng() * 0.75 });
    }
    const occupied = occupiedCells(options.buildings);
    const interiorDecorCells: Array<{ x: number; y: number }> = [];
    for (let attempt = 0; attempt < 120 && interiorDecorCells.length < (options.quality === "low" ? 7 : 12); attempt += 1) {
      const x = 1 + Math.floor(rng() * Math.max(1, options.gridSize - 2));
      const y = 1 + Math.floor(rng() * Math.max(1, options.gridSize - 2));
      const key = `${x},${y}`;
      if (occupied.has(key) || roadCellKeys.has(key) || interiorDecorCells.some(cell => Math.abs(cell.x - x) + Math.abs(cell.y - y) < 2)) continue;
      interiorDecorCells.push({ x, y });
      treeGroups[treeKeys[interiorDecorCells.length % treeKeys.length]].push({
        position: new THREE.Vector3((x + 0.5) * CELL_SIZE, 0, (y + 0.5) * CELL_SIZE),
        rotation: rng() * Math.PI * 2,
        scale: 0.72 + rng() * 0.34,
      });
    }
    for (const key of treeKeys) addInstancedAsset(propsGroup, key, treeGroups[key]);
    for (const [index, cell] of interiorDecorCells.slice(0, 5).entries()) {
      const patch = markOwned(new THREE.Mesh(
        new THREE.CircleGeometry(0.8 + rng() * 0.45, 12),
        new THREE.MeshStandardMaterial({ color: index % 2 ? 0x6d823f : 0x8a7147, roughness: 1 }),
      ));
      patch.rotation.x = -Math.PI / 2;
      patch.scale.y = 0.62 + rng() * 0.35;
      patch.position.set((cell.x + 0.5) * CELL_SIZE, 0.012, (cell.y + 0.5) * CELL_SIZE);
      patch.receiveShadow = true;
      propsGroup.add(patch);
    }
    const rocks: Transform[] = Array.from({ length: options.quality === "low" ? 8 : 16 }, () => ({
      position: new THREE.Vector3(-9 + rng() * (size + 18), 0, rng() > 0.5 ? -5 - rng() * 9 : size + 5 + rng() * 9),
      rotation: rng() * Math.PI * 2,
      scale: 1.1 + rng() * 1.25,
    }));
    addInstancedAsset(propsGroup, "fantasy.rock-large", rocks);

    const townHall = options.buildings.find(building => building.buildingId === "town_hall");
    if (townHall) {
      const dims = buildingDimensions(townHall.buildingId, townHall.rotation);
      const centerX = (townHall.x + dims.width / 2) * CELL_SIZE;
      const centerZ = (townHall.y + dims.height / 2) * CELL_SIZE;
      addAsset(propsGroup, "fantasy.fountain", [centerX + 4.6, 0.04, centerZ + 2.8], 0, 1.3);
      addAsset(propsGroup, "fantasy.stall-red", [centerX - 4.5, 0, centerZ + 3.3], Math.PI / 2, 1.45);
      addAsset(propsGroup, "fantasy.stall-green", [centerX - 4.4, 0, centerZ + 5], Math.PI / 2, 1.35);
      addAsset(propsGroup, "fantasy.cart", [centerX + 3.8, 0, centerZ + 5.1], -Math.PI / 4, 1.15);
      const lamps: Transform[] = [
        [-2.8, 2.4], [2.8, 2.4], [-2.8, 5.2], [2.8, 5.2],
      ].map(([dx, dz]) => ({ position: new THREE.Vector3(centerX + dx, 0, centerZ + dz), scale: 1.55 }));
      addInstancedAsset(propsGroup, "fantasy.lantern", lamps);
    }
  }

  function buildCitizens(): void {
    clearGroup(citizensGroup);
    for (const mixer of mixers) mixer.stopAllAction();
    mixers.length = 0;
    citizens.length = 0;
    if (!walkPaths.length) return;
    const rng = randomFrom(`${options.cityId}:citizens`);
    const count = options.quality === "low" ? 3 : 5;
    for (let index = 0; index < count; index += 1) {
      const key: CityAssetKey = index % 2 ? "characters.female" : "characters.male";
      const source = getLoadedAsset(key);
      const character = cloneSkeleton(source.scene) as THREE.Group;
      character.scale.setScalar(1.38);
      const path = walkPaths[index % walkPaths.length].map(point => point.clone());
      if (path.length < 2) continue;
      character.position.copy(path[index % path.length]);
      character.position.y = 0.02;
      character.traverse(object => {
        if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; }
      });
      citizensGroup.add(character);
      const mixer = new THREE.AnimationMixer(character);
      const walk = source.animations.find(clip => clip.name.toLowerCase() === "walk") ?? source.animations[0];
      if (walk) mixer.clipAction(walk).play();
      mixers.push(mixer);
      citizens.push({ group: character, path, index: Math.min(1, path.length - 1), direction: 1, speed: 0.9 + rng() * 0.35 });
    }
  }

  function validatePlacement(placement: BuildingPlacement): boolean {
    if (!isPlacementWithinBounds(placement, options.gridSize)) return false;
    const occupied = occupiedCells(options.buildings, options.mode === "edit" ? placement.buildingId : undefined);
    return buildingOccupiedTiles(placement).every(tile => !occupied.has(`${tile.x},${tile.y}`));
  }

  function buildOverlay(): void {
    clearGroup(overlayGroup);
    renderer.domElement.dataset.cityGrid = options.mode === "view" ? "hidden" : "local-only";
    const boundary = groundGroup.getObjectByName("build-boundary");
    if (boundary) boundary.visible = options.mode !== "view";
    const draft = options.placementDraft;
    if (options.mode === "view" || !draft) return;
    placementIsValid = validatePlacement(draft);
    const state = options.buildings.find(building => building.buildingId === draft.buildingId) ?? {
      ...draft, level: 1,
    };
    const ghost = createBuildingVisual(state, options.factionId);
    ghost.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
      const materials = sourceMaterials.map(material => {
        const clone = material.clone();
        clone.transparent = true;
        clone.opacity = 0.58;
        if (clone instanceof THREE.MeshStandardMaterial) clone.color.lerp(new THREE.Color(placementIsValid ? 0x69d17c : 0xef5961), 0.5);
        return clone;
      });
      object.material = Array.isArray(object.material) ? materials : materials[0];
      object.userData.cityOwnedMaterial = true;
    });
    const rotatedDims = buildingDimensions(draft.buildingId, draft.rotation);
    ghost.position.set((draft.x + rotatedDims.width / 2) * CELL_SIZE, 0.1, (draft.y + rotatedDims.height / 2) * CELL_SIZE);
    ghost.rotation.y = (draft.rotation * Math.PI) / 180;
    overlayGroup.add(ghost);

    const dims = rotatedDims;
    const footprint = markOwned(new THREE.Mesh(
      new THREE.PlaneGeometry(dims.width * CELL_SIZE, dims.height * CELL_SIZE),
      new THREE.MeshBasicMaterial({ color: placementIsValid ? 0x59cc73 : 0xee4f58, transparent: true, opacity: 0.32, side: THREE.DoubleSide }),
    ));
    footprint.rotation.x = -Math.PI / 2;
    footprint.position.set((draft.x + dims.width / 2) * CELL_SIZE, 0.085, (draft.y + dims.height / 2) * CELL_SIZE);
    overlayGroup.add(footprint);
  }

  function rebuildWorld(): void {
    buildGround();
    buildWalls();
    buildBuildings();
    buildRoads();
    buildProps();
    buildCitizens();
    buildOverlay();
  }
  rebuildWorld();

  function groundIntersection(clientX: number, clientY: number, planeY?: number): THREE.Vector3 | null {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = new THREE.Vector3();
    const plane = planeY === undefined ? groundPlane : new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    return raycaster.ray.intersectPlane(plane, hit) ? hit : null;
  }

  function previewAt(clientX: number, clientY: number): void {
    const current = options.placementDraft;
    const buildingId = current?.buildingId ?? options.selectedBuildingId;
    if (!buildingId || options.mode === "view") return;
    const rotation = (current?.rotation ?? options.buildings.find(building => building.buildingId === buildingId)?.rotation ?? 0) as CityRotation;
    const hit = groundIntersection(clientX, clientY);
    if (!hit) return;
    const dims = buildingDimensions(buildingId, rotation);
    const placement: BuildingPlacement = {
      buildingId,
      x: Math.floor(hit.x / CELL_SIZE - dims.width / 2 + 0.5),
      y: Math.floor(hit.z / CELL_SIZE - dims.height / 2 + 0.5),
      rotation,
    };
    options.placementDraft = placement;
    placementIsValid = validatePlacement(placement);
    buildOverlay();
    options.onPlacementPreview?.(placement, placementIsValid);
  }

  function pickBuilding(clientX: number, clientY: number): BuildingId | null {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return (raycaster.intersectObjects(colliders, false)[0]?.object.userData.buildingId as BuildingId | undefined) ?? null;
  }

  const activePointers = new Map<number, { x: number; y: number }>();
  let dragOrigin = { x: 0, y: 0 };
  let moved = false;
  let gestureHadPinch = false;
  let pinchDistance = 0;
  let lastPinchCenter = new THREE.Vector2();
  let dragAnchor: THREE.Vector3 | null = null;
  let dragPlaneY = 0;
  let leavingCity = false;
  const zoomTo = (next: number) => {
    if (next > maxZoom && options.mode === "view" && !leavingCity && options.onZoomOutToWorld) {
      leavingCity = true;
      options.onZoomOutToWorld();
    }
    zoomFrustum = THREE.MathUtils.clamp(next, minZoom, maxZoom);
    updateProjection();
  };

  const onPointerDown = (event: PointerEvent) => {
    try {
      renderer.domElement.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events (including browser automation) have no native
      // active pointer to capture, but should still exercise city interaction.
    }
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragOrigin = { x: event.clientX, y: event.clientY };
    moved = false;
    if (options.mode !== "view" && activePointers.size === 1) {
      previewAt(event.clientX, event.clientY);
    }
    if (activePointers.size >= 2) gestureHadPinch = true;
    if (activePointers.size === 2) {
      const values = [...activePointers.values()];
      pinchDistance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
      lastPinchCenter.set((values[0].x + values[1].x) / 2, (values[0].y + values[1].y) / 2);
      updateProjection();
      dragAnchor = groundIntersection(lastPinchCenter.x, lastPinchCenter.y);
    } else if (activePointers.size === 1) {
      updateProjection();
      dragAnchor = groundIntersection(event.clientX, event.clientY);
      dragPlaneY = dragAnchor?.y ?? 0;
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.size === 2) {
      const values = [...activePointers.values()];
      const distance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
      const center = new THREE.Vector2((values[0].x + values[1].x) / 2, (values[0].y + values[1].y) / 2);
      updateProjection();
      const zoomBefore = groundIntersection(center.x, center.y);
      if (pinchDistance > 0 && distance > 0) zoomTo(zoomFrustum * (pinchDistance / distance));
      const zoomAfter = groundIntersection(center.x, center.y);
      if (zoomBefore && zoomAfter) cameraTarget.add(zoomBefore.sub(zoomAfter));
      updateProjection();
      const panBefore = groundIntersection(lastPinchCenter.x, lastPinchCenter.y);
      const panAfter = groundIntersection(center.x, center.y);
      if (panBefore && panAfter) cameraTarget.add(panBefore.sub(panAfter));
      pinchDistance = distance;
      lastPinchCenter.copy(center);
      moved = true;
      updateProjection();
      return;
    }
    if (options.mode !== "view" && (options.placementDraft || options.selectedBuildingId)) {
      // Placement follows an active drag only. Hovering used to keep moving the
      // ghost while the player travelled toward the confirm button, often
      // leaving it outside the wall and disabling confirmation at the last moment.
      previewAt(event.clientX, event.clientY);
      return;
    }
    if (Math.hypot(event.clientX - dragOrigin.x, event.clientY - dragOrigin.y) > 4) moved = true;
    updateProjection();
    const current = groundIntersection(event.clientX, event.clientY, dragPlaneY);
    if (dragAnchor && current) cameraTarget.add(dragAnchor.clone().sub(current));
    const extent = options.gridSize * CELL_SIZE;
    cameraTarget.x = THREE.MathUtils.clamp(cameraTarget.x, -8, extent + 8);
    cameraTarget.z = THREE.MathUtils.clamp(cameraTarget.z, -8, extent + 8);
    updateProjection();
  };

  const onPointerUp = (event: PointerEvent) => {
    activePointers.delete(event.pointerId);
    pinchDistance = 0;
    if (gestureHadPinch) {
      // A two-pointer gesture is never a click. Keep this guard alive while
      // the other pointer is still down, including pointercancel paths.
      dragAnchor = null;
      if (activePointers.size === 0) {
        gestureHadPinch = false;
        moved = false;
      }
      return;
    }
    if (moved) {
      if (activePointers.size === 1) {
        const remaining = [...activePointers.values()][0]!;
        updateProjection();
        dragAnchor = groundIntersection(remaining.x, remaining.y);
        dragPlaneY = dragAnchor?.y ?? 0;
        dragOrigin = { x: remaining.x, y: remaining.y };
        moved = false;
      } else {
        dragAnchor = null;
      }
      return;
    }
    if (options.mode === "edit" && options.placementDraft && placementIsValid) {
      const draft = options.placementDraft;
      options.onBuildingMoved?.(draft.buildingId, draft.x, draft.y, draft.rotation ?? 0);
      return;
    }
    if (options.mode === "place") {
      previewAt(event.clientX, event.clientY);
      return;
    }
    options.onSelectBuilding(pickBuilding(event.clientX, event.clientY));
    dragAnchor = null;
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    updateProjection();
    const before = groundIntersection(event.clientX, event.clientY);
    zoomTo(zoomFrustum + event.deltaY * 0.025);
    const after = groundIntersection(event.clientX, event.clientY);
    if (before && after) cameraTarget.add(before.sub(after));
    updateProjection();
  };
  const onContextMenu = (event: Event) => event.preventDefault();
  const onResize = () => { if (!destroyed) updateProjection(); };
  const onContextLost = (event: Event) => { event.preventDefault(); options.onContextLost?.(); };

  function rotateSelectedBuilding(): void {
    const current = options.placementDraft;
    if (!current || options.mode === "view") return;
    const index = cityRotations.indexOf((current.rotation ?? 0) as CityRotation);
    const placement = { ...current, rotation: cityRotations[(index + 1) % cityRotations.length] };
    options.placementDraft = placement;
    placementIsValid = validatePlacement(placement);
    buildOverlay();
    options.onPlacementPreview?.(placement, placementIsValid);
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (isModalOpen()) return;
    if (event.key.toLowerCase() === "r") rotateSelectedBuilding();
  };

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("pointercancel", onPointerUp);
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
  renderer.domElement.addEventListener("contextmenu", onContextMenu);
  renderer.domElement.addEventListener("webglcontextlost", onContextLost);
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onKeyDown);

  let animationFrame = 0;
  const clock = new THREE.Clock();
  const animate = () => {
    if (destroyed || document.hidden) return;
    animationFrame = requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);
    mixers.forEach(mixer => mixer.update(delta));
    for (const citizen of citizens) {
      const target = citizen.path[citizen.index];
      const direction = target.clone().sub(citizen.group.position);
      direction.y = 0;
      if (direction.length() < 0.15) {
        if (citizen.index === citizen.path.length - 1) citizen.direction = -1;
        if (citizen.index === 0) citizen.direction = 1;
        citizen.index += citizen.direction;
      } else {
        direction.normalize();
        citizen.group.position.addScaledVector(direction, citizen.speed * delta);
        citizen.group.rotation.y = Math.atan2(direction.x, direction.z);
      }
    }
    renderer.render(scene, camera);
  };
  const onVisibilityChange = () => {
    cancelAnimationFrame(animationFrame);
    if (!document.hidden && !destroyed) { clock.start(); animationFrame = requestAnimationFrame(animate); }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  animationFrame = requestAnimationFrame(animate);

  function updateOptions(next: Partial<CitySceneOptions>): void {
    const worldChanged = next.gridSize !== undefined && next.gridSize !== options.gridSize
      || next.cityId !== undefined && next.cityId !== options.cityId
      || next.factionId !== undefined && next.factionId !== options.factionId
      || next.equipped !== undefined && next.equipped !== options.equipped
      || next.buildings !== undefined && next.buildings !== options.buildings;
    const selectionChanged = next.selectedBuildingId !== undefined && next.selectedBuildingId !== options.selectedBuildingId;
    options = { ...options, ...next };
    renderer.domElement.dataset.cityFaction = options.factionId;
    renderer.domElement.dataset.cityFlagColor = options.equipped?.flag_color ?? "default";
    if (worldChanged) rebuildWorld();
    else {
      if (selectionChanged) buildBuildings();
      buildOverlay();
    }
  }

  function focusBuilding(buildingId: BuildingId): void {
    const placement = options.buildings.find(building => building.buildingId === buildingId);
    if (!placement) return;
    const dims = buildingDimensions(buildingId, placement.rotation);
    cameraTarget.set((placement.x + dims.width / 2) * CELL_SIZE, 0, (placement.y + dims.height / 2) * CELL_SIZE);
    updateProjection();
  }

  function resetCamera(): void {
    const size = options.gridSize * CELL_SIZE;
    cameraTarget.set(size / 2, 0, size / 2);
    zoomFrustum = Math.max(30, options.gridSize * 2.8);
    updateProjection();
  }

  function destroy(): void {
    destroyed = true;
    cancelAnimationFrame(animationFrame);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("keydown", onKeyDown);
    renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    renderer.domElement.removeEventListener("pointermove", onPointerMove);
    renderer.domElement.removeEventListener("pointerup", onPointerUp);
    renderer.domElement.removeEventListener("pointercancel", onPointerUp);
    renderer.domElement.removeEventListener("wheel", onWheel);
    renderer.domElement.removeEventListener("contextmenu", onContextMenu);
    renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
    for (const group of [groundGroup, roadGroup, wallsGroup, buildingsGroup, propsGroup, citizensGroup, overlayGroup]) clearGroup(group);
    mixers.forEach(mixer => mixer.stopAllAction());
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    updateOptions,
    setEditPlacement(placement) { options.placementDraft = placement; buildOverlay(); },
    rotateSelectedBuilding,
    focusBuilding,
    resetCamera,
    destroy,
  };
}
