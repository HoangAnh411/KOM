import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { cityAssetManifest, type CityAssetKey } from "./manifest.js";

const assetCache = new Map<CityAssetKey, GLTF>();
let loadPromise: Promise<Map<CityAssetKey, GLTF>> | null = null;

export async function loadCityAssets(onProgress?: (progress: number) => void): Promise<Map<CityAssetKey, GLTF>> {
  const entries = Object.entries(cityAssetManifest) as Array<[CityAssetKey, string]>;
  if (assetCache.size === entries.length) {
    onProgress?.(1);
    return assetCache;
  }
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    let completed = 0;

    await Promise.all(entries.map(async ([key, url]) => {
      if (!assetCache.has(key)) {
        const gltf = await loader.loadAsync(url);
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse(child => {
          if (child.type === "Mesh") {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        assetCache.set(key, gltf);
      }
      completed += 1;
      onProgress?.(completed / entries.length);
    }));

    return assetCache;
  })().catch(error => {
    loadPromise = null;
    throw error;
  });

  return loadPromise;
}

export function getLoadedAsset(key: CityAssetKey): GLTF {
  const asset = assetCache.get(key);
  if (!asset) throw new Error(`City asset ${key} has not been loaded`);
  return asset;
}

export function cloneCityAsset(key: CityAssetKey) {
  return getLoadedAsset(key).scene.clone(true);
}

export function isWebGL2Supported(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(window.WebGL2RenderingContext && canvas.getContext("webgl2"));
  } catch {
    return false;
  }
}
