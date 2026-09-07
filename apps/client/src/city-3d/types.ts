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

export interface CitySceneInstance {
  updateOptions: (options: Partial<CitySceneOptions>) => void;
  setEditPlacement: (placement: BuildingPlacement | null, isValid: boolean) => void;
  rotateSelectedBuilding: () => void;
  focusBuilding: (buildingId: BuildingId) => void;
  resetCamera: () => void;
  destroy: () => void;
}
