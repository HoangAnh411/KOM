import type { BuildingId, BuildingPlacement, CityRotation, EquippedCosmetics, FactionId } from "@kingdoms/shared";

export type CityQuality = "low" | "medium" | "high";
export type CityInteractionMode = "view" | "edit" | "place";

export interface CityBuildingState {
  buildingId: BuildingId;
  level: number;
  x: number;
  y: number;
  rotation: CityRotation;
  isUpgrading?: boolean;
  upgradeProgress?: number; // 0..1
}

export interface CitySceneOptions {
  cityId: string;
  factionId: FactionId;
  equipped?: EquippedCosmetics;
  gridSize: number;
  townHallLevel: number;
  buildings: CityBuildingState[];
  selectedBuildingId: BuildingId | null;
  mode: CityInteractionMode;
  placementDraft: BuildingPlacement | null;
  quality: CityQuality;
  onSelectBuilding: (buildingId: BuildingId | null) => void;
  onPlacementPreview?: (placement: BuildingPlacement, isValid: boolean) => void;
  onBuildingMoved?: (buildingId: BuildingId, x: number, y: number, rotation: CityRotation) => void;
  onContextLost?: () => void;
  onZoomOutToWorld?: () => void;
}

export interface CitySceneContentSignatures {
  static: string;
  topology: string;
  visual: string;
  overlay: string;
}

function sortedBuildings(buildings: CityBuildingState[]): CityBuildingState[] {
  return [...buildings].sort((left, right) => left.buildingId.localeCompare(right.buildingId));
}

/** Deterministic signatures for the scene's independently rebuildable content. */
export function citySceneContentSignatures(options: CitySceneOptions): CitySceneContentSignatures {
  const buildings = sortedBuildings(options.buildings);
  const draft = options.placementDraft;
  return {
    static: JSON.stringify([options.cityId, options.gridSize]),
    topology: JSON.stringify([
      options.cityId,
      options.gridSize,
      buildings.map(building => [building.buildingId, building.x, building.y, building.rotation]),
    ]),
    visual: JSON.stringify([
      options.cityId,
      options.factionId,
      options.quality,
      options.equipped?.flag_color ?? null,
      buildings.map(building => [building.buildingId, building.level, Boolean(building.isUpgrading)]),
    ]),
    overlay: JSON.stringify([
      options.mode,
      options.selectedBuildingId,
      draft ? [draft.buildingId, draft.x, draft.y, draft.rotation ?? 0] : null,
    ]),
  };
}

export interface CitySceneInstance {
  updateOptions: (options: Partial<CitySceneOptions>) => void;
  setEditPlacement: (placement: BuildingPlacement | null, isValid: boolean) => void;
  setActive: (active: boolean) => void;
  rotateSelectedBuilding: () => void;
  focusBuilding: (buildingId: BuildingId) => void;
  resetCamera: () => void;
  destroy: () => void;
}
