import type { WorldSnapshot } from "@kingdoms/shared";

export type MapSelection = { kind: "army" | "city"; id: string } | { kind: "tile"; x: number; y: number };
export type InteractionMode = { kind: "idle" } | { kind: "move"; armyId: string } | { kind: "attack"; armyId: string };

export type MapRenderer = "pixi" | "three";
export type MapFallbackReason = "three-init-failed" | "webgl-context-lost";
export type MapViewState = { offsetX: number; offsetY: number; zoom: number };

export type WorldMap = {
  update: (next: WorldSnapshot, selection?: MapSelection) => void;
  focusCity: (x: number, y: number) => void;
  setInteraction: (mode: InteractionMode) => void;
  getViewState: () => MapViewState;
  setViewState: (view: MapViewState) => void;
  destroy: () => void;
};

export type WorldMapFactoryArgs = {
  container: HTMLElement;
  snapshot: WorldSnapshot;
  ownPlayerId: string;
  onSelect: (selection: MapSelection | undefined) => void;
  initialView?: MapViewState;
  onFallback?: (reason: MapFallbackReason) => void;
};

export type WorldMapFactory = (args: WorldMapFactoryArgs) => WorldMap | Promise<WorldMap>;
