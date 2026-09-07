import React, { useMemo, useState } from "react";
import {
  buildingDimensions,
  buildingOccupiedTiles,
  isPlacementWithinBounds,
} from "@kingdoms/shared";
import type { BuildingId, BuildingPlacement, CityRotation } from "@kingdoms/shared";
import type { CityBuildingState, CityInteractionMode } from "./types.js";

interface City2DFallbackProps {
  gridSize: number;
  buildings: CityBuildingState[];
  selectedBuildingId: BuildingId | null;
  mode: CityInteractionMode;
  placementDraft: BuildingPlacement | null;
  onSelectBuilding: (buildingId: BuildingId | null) => void;
  onPlacementPreview?: (placement: BuildingPlacement, isValid: boolean) => void;
  onBuildingMoved?: (buildingId: BuildingId, x: number, y: number, rotation: CityRotation) => void;
}

const BUILDING_IMAGES: Record<BuildingId, string> = {
  town_hall: "/assets/city/town-hall.png",
  warehouse: "/assets/city/warehouse.png",
  road_depot: "/assets/city/road-depot.png",
  barracks: "/assets/city/barracks.png",
  farm: "/assets/city/town-hall.png",
  lumber_mill: "/assets/city/road-depot.png",
  stone_quarry: "/assets/city/warehouse.png",
  academy: "/assets/city/town-hall.png",
  hospital: "/assets/city/barracks.png",
};

export const City2DFallback: React.FC<City2DFallbackProps> = ({
  gridSize,
  buildings,
  selectedBuildingId,
  mode,
  placementDraft,
  onSelectBuilding,
  onPlacementPreview,
  onBuildingMoved,
}) => {
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number } | null>(null);

  // 2D grid cell sizing
  const cellPixelSize = Math.max(28, Math.min(54, Math.floor(700 / gridSize)));

  const selectedBuilding = useMemo(
    () => buildings.find(b => b.buildingId === selectedBuildingId) ?? null,
    [buildings, selectedBuildingId]
  );

  const placementIsValid = (candidate: BuildingPlacement, exclude?: BuildingId) => {
    if (!isPlacementWithinBounds(candidate, gridSize)) return false;
    const occupied = new Set<string>();
    for (const building of buildings) {
      if (building.buildingId === exclude) continue;
      for (const tile of buildingOccupiedTiles(building)) occupied.add(`${tile.x},${tile.y}`);
    }
    return buildingOccupiedTiles(candidate).every(tile => !occupied.has(`${tile.x},${tile.y}`));
  };

  const handleCellClick = (cellX: number, cellY: number) => {
    const activeBuildingId = placementDraft?.buildingId ?? selectedBuilding?.buildingId;
    if (mode !== "view" && activeBuildingId) {
      const bId = activeBuildingId;
      const rot = (placementDraft?.rotation ?? selectedBuilding?.rotation ?? 0) as CityRotation;
      const dims = buildingDimensions(bId, rot);

      const targetX = Math.max(0, Math.min(gridSize - dims.width, cellX - Math.floor(dims.width / 2)));
      const targetY = Math.max(0, Math.min(gridSize - dims.height, cellY - Math.floor(dims.height / 2)));

      const candidate = { buildingId: bId, x: targetX, y: targetY, rotation: rot };
      const valid = placementIsValid(candidate, mode === "edit" ? bId : undefined);
      onPlacementPreview?.(candidate, valid);
      if (mode === "edit" && valid) onBuildingMoved?.(bId, targetX, targetY, rot);
      return;
    }

    // Check if clicked cell contains a building
    const clickedBuilding = buildings.find(b => {
      const tiles = buildingOccupiedTiles(b);
      return tiles.some(t => t.x === cellX && t.y === cellY);
    });

    onSelectBuilding(clickedBuilding?.buildingId ?? null);
  };

  return (
    <div className="city-2d-fallback" style={{ width: "100%", height: "100%", overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div
        className="city-2d-grid"
        style={{
          position: "relative",
          width: `${gridSize * cellPixelSize}px`,
          height: `${gridSize * cellPixelSize}px`,
          backgroundColor: "#829f64",
          border: "4px solid #4a6b82",
          borderRadius: "8px",
          boxShadow: "0 12px 36px rgba(0, 0, 0, 0.45)",
          display: "grid",
          gridTemplateColumns: `repeat(${gridSize}, ${cellPixelSize}px)`,
          gridTemplateRows: `repeat(${gridSize}, ${cellPixelSize}px)`,
        }}
      >
        {/* Render grid tiles */}
        {Array.from({ length: gridSize * gridSize }).map((_, idx) => {
          const gx = idx % gridSize;
          const gy = Math.floor(idx / gridSize);
          const isHovered = hoveredCell?.x === gx && hoveredCell?.y === gy;

          return (
            <div
              key={`${gx},${gy}`}
              data-x={gx}
              data-y={gy}
              onClick={() => handleCellClick(gx, gy)}
              onMouseEnter={() => setHoveredCell({ x: gx, y: gy })}
              onMouseLeave={() => setHoveredCell(null)}
              style={{
                width: `${cellPixelSize}px`,
                height: `${cellPixelSize}px`,
                borderRight: "1px solid rgba(255,255,255,0.15)",
                borderBottom: "1px solid rgba(255,255,255,0.15)",
                backgroundColor: isHovered ? "rgba(255,255,255,0.2)" : "transparent",
                cursor: mode !== "view" ? "crosshair" : "pointer",
              }}
            />
          );
        })}

        {mode !== "view" && placementDraft && (() => {
          const dims = buildingDimensions(placementDraft.buildingId, placementDraft.rotation);
          const valid = placementIsValid(placementDraft, mode === "edit" ? placementDraft.buildingId : undefined);
          return <div
            data-city-fallback-ghost
            style={{
              position: "absolute",
              pointerEvents: "none",
              left: `${placementDraft.x * cellPixelSize}px`,
              top: `${placementDraft.y * cellPixelSize}px`,
              width: `${dims.width * cellPixelSize}px`,
              height: `${dims.height * cellPixelSize}px`,
              zIndex: 20,
              border: `3px solid ${valid ? "#73e28a" : "#ff6670"}`,
              borderRadius: "6px",
              background: valid ? "rgba(74, 190, 99, .28)" : "rgba(220, 55, 65, .3)",
              boxShadow: `0 0 18px ${valid ? "rgba(74, 190, 99, .5)" : "rgba(220, 55, 65, .5)"}`,
            }}
          >
            <img src={BUILDING_IMAGES[placementDraft.buildingId]} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", opacity: .72 }} />
          </div>;
        })()}

        {/* Render placed buildings */}
        {buildings.map(b => {
          const dims = buildingDimensions(b.buildingId, b.rotation);
          const isSelected = b.buildingId === selectedBuildingId;
          const imgSrc = BUILDING_IMAGES[b.buildingId];

          return (
            <div
              key={b.buildingId}
              onClick={e => {
                e.stopPropagation();
                onSelectBuilding(b.buildingId);
              }}
              style={{
                position: "absolute",
                left: `${b.x * cellPixelSize}px`,
                top: `${b.y * cellPixelSize}px`,
                width: `${dims.width * cellPixelSize}px`,
                height: `${dims.height * cellPixelSize}px`,
                outline: isSelected ? "3px solid #ffd54f" : "1px solid rgba(0,0,0,0.3)",
                borderRadius: "4px",
                overflow: "hidden",
                cursor: "pointer",
                zIndex: 10,
                backgroundColor: "rgba(0,0,0,0.15)",
                transform: `rotate(${b.rotation}deg)`,
                transformOrigin: "center center",
                transition: "outline 0.15s ease",
              }}
              title={`${b.buildingId} (Cấp ${b.level})`}
            >
              <img
                src={imgSrc}
                alt={b.buildingId}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: 2,
                  left: 2,
                  background: "rgba(0,0,0,0.75)",
                  color: "#fff",
                  fontSize: "10px",
                  padding: "1px 4px",
                  borderRadius: "2px",
                  fontWeight: "bold",
                }}
              >
                Lv.{b.level}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
