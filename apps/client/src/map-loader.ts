import type { InteractionMode, MapFallbackReason, MapRenderer, MapSelection, MapViewState, WorldMap, WorldMapFactory, WorldMapFactoryArgs } from "./map-contract.js";
import { resolveMapRenderer } from "./map-renderer.js";

const rendererAttribute = "data-map-renderer";
const fallbackAttribute = "data-map-fallback-reason";

async function loadFactory(renderer: MapRenderer): Promise<WorldMapFactory> {
  if (renderer === "three") return (await import("./map-three.js")).createThreeWorldMap;
  return (await import("./map-pixi.js")).createPixiWorldMap;
}

export async function createWorldMap(args: WorldMapFactoryArgs): Promise<WorldMap> {
  const preferred = resolveMapRenderer({
    setting: import.meta.env.VITE_MAP_RENDERER,
    rolloutPercent: import.meta.env.VITE_THREE_MAP_ROLLOUT_PERCENT,
    playerId: args.ownPlayerId,
  });
  let latestSnapshot = args.snapshot;
  let latestSelection: MapSelection | undefined;
  let latestInteraction: InteractionMode = { kind: "idle" };
  let latestView = args.initialView;
  let backend: WorldMap | undefined;
  let activeRenderer = preferred;
  let destroyed = false;
  let fallbackStarted = false;

  const markRenderer = (renderer: MapRenderer, reason?: MapFallbackReason) => {
    args.container.setAttribute(rendererAttribute, renderer);
    if (reason) args.container.setAttribute(fallbackAttribute, reason);
    else args.container.removeAttribute(fallbackAttribute);
  };
  const activate = async (renderer: MapRenderer, reason?: MapFallbackReason) => {
    const factory = await loadFactory(renderer);
    if (destroyed) return;
    const next = await factory({ ...args, snapshot: latestSnapshot, initialView: latestView, onFallback: beginFallback });
    if (destroyed) { next.destroy(); return; }
    backend?.destroy();
    backend = next;
    activeRenderer = renderer;
    backend.update(latestSnapshot, latestSelection);
    backend.setInteraction(latestInteraction);
    if (latestView) backend.setViewState(latestView);
    markRenderer(renderer, reason);
  };
  const beginFallback = (reason: MapFallbackReason) => {
    if (destroyed || activeRenderer !== "three" || fallbackStarted) return;
    fallbackStarted = true;
    latestView = backend?.getViewState() ?? latestView;
    void activate("pixi", reason).then(() => args.onFallback?.(reason)).catch(() => undefined);
  };

  try { await activate(preferred); }
  catch (error) {
    if (preferred !== "three" || destroyed) throw error;
    fallbackStarted = true;
    await activate("pixi", "three-init-failed");
    args.onFallback?.("three-init-failed");
  }

  return {
    update: (snapshot, selection) => { latestSnapshot = snapshot; latestSelection = selection; backend?.update(snapshot, selection); },
    focusCity: (x, y) => backend?.focusCity(x, y),
    setInteraction: (mode) => { latestInteraction = mode; backend?.setInteraction(mode); },
    getViewState: () => backend?.getViewState() ?? latestView ?? { offsetX: 0, offsetY: 0, zoom: 1 },
    setViewState: (view: MapViewState) => { latestView = view; backend?.setViewState(view); },
    destroy: () => { destroyed = true; backend?.destroy(); backend = undefined; args.container.removeAttribute(rendererAttribute); args.container.removeAttribute(fallbackAttribute); },
  };
}
