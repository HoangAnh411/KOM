import type { EquippedCosmetics, WorldSnapshot } from "@kingdoms/shared";
import type { InteractionMode } from "./state.js";

export type MapSelection = { kind: "army" | "city"; id: string } | { kind: "tile"; x: number; y: number };

export type WorldMap = {
  update: (next: WorldSnapshot, selection?: MapSelection, equipped?: EquippedCosmetics) => void;
  focusCity: (x: number, y: number) => void;
  setInteraction: (mode: InteractionMode) => void;
  retryAssets?: () => void;
  setActive?: (active: boolean) => void;
  destroy: () => void;
};
