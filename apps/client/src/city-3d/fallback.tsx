import React, { useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  buildingDimensions,
  buildingOccupiedTiles,
  gameRules,
  isPlacementWithinBounds,
} from "@kingdoms/shared";
import type { BuildingId, BuildingPlacement, CityRotation } from "@kingdoms/shared";
import type { CityBuildingState, CityInteractionMode } from "./types.js";
import { Button } from "../ui/Button.js";

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
  const [focusedCell, setFocusedCell] = useState(0);
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const cellPixelSize = Math.max(28, Math.min(54, Math.floor(700 / gridSize)));

  const selectedBuilding = useMemo(
    () => buildings.find(building => building.buildingId === selectedBuildingId) ?? null,
    [buildings, selectedBuildingId],
  );

  const occupiedByCell = useMemo(() => {
    const result = new Map<string, CityBuildingState>();
    for (const building of buildings) {
      for (const tile of buildingOccupiedTiles(building)) result.set(`${tile.x},${tile.y}`, building);
    }
    return result;
  }, [buildings]);

  const placementIsValid = (candidate: BuildingPlacement, exclude?: BuildingId) => {
    if (!isPlacementWithinBounds(candidate, gridSize)) return false;
    const occupied = new Set<string>();
    for (const building of buildings) {
      if (building.buildingId === exclude) continue;
      for (const tile of buildingOccupiedTiles(building)) occupied.add(`${tile.x},${tile.y}`);
    }
    return buildingOccupiedTiles(candidate).every(tile => !occupied.has(`${tile.x},${tile.y}`));
  };

  const activateCell = (cellX: number, cellY: number) => {
    const activeBuildingId = placementDraft?.buildingId ?? selectedBuilding?.buildingId;
    if (mode !== "view" && activeBuildingId) {
      const rotation = (placementDraft?.rotation ?? selectedBuilding?.rotation ?? 0) as CityRotation;
      const dimensions = buildingDimensions(activeBuildingId, rotation);
      const targetX = Math.max(0, Math.min(gridSize - dimensions.width, cellX - Math.floor(dimensions.width / 2)));
      const targetY = Math.max(0, Math.min(gridSize - dimensions.height, cellY - Math.floor(dimensions.height / 2)));
      const candidate = { buildingId: activeBuildingId, x: targetX, y: targetY, rotation };
      const valid = placementIsValid(candidate, mode === "edit" ? activeBuildingId : undefined);
      onPlacementPreview?.(candidate, valid);
      if (mode === "edit" && valid) onBuildingMoved?.(activeBuildingId, targetX, targetY, rotation);
      return;
    }
    onSelectBuilding(occupiedByCell.get(`${cellX},${cellY}`)?.buildingId ?? null);
  };

  const onCellKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const x = index % gridSize;
    const y = Math.floor(index / gridSize);
    let nextX = x;
    let nextY = y;
    if (event.key === "ArrowLeft") nextX = Math.max(0, x - 1);
    else if (event.key === "ArrowRight") nextX = Math.min(gridSize - 1, x + 1);
    else if (event.key === "ArrowUp") nextY = Math.max(0, y - 1);
    else if (event.key === "ArrowDown") nextY = Math.min(gridSize - 1, y + 1);
    else return;
    event.preventDefault();
    const next = nextY * gridSize + nextX;
    setFocusedCell(next);
    cellRefs.current[next]?.focus();
  };

  return (
    <section className="city-2d-fallback" aria-labelledby="city-2d-title" aria-describedby="city-2d-help">
      <h2 id="city-2d-title" className="city-2d-sr-only">Bản đồ nội thành 2D</h2>
      <p id="city-2d-help" className="city-2d-sr-only">Dùng các phím mũi tên để di chuyển giữa các ô. Nhấn Enter hoặc Space để chọn ô hoặc công trình.</p>
      <div
        className="city-2d-grid"
        role="grid"
        aria-label={`Bản đồ nội thành ${gridSize} hàng, ${gridSize} cột`}
        aria-rowcount={gridSize}
        aria-colcount={gridSize}
        style={{
          width: `${gridSize * cellPixelSize}px`,
          height: `${gridSize * cellPixelSize}px`,
          gridTemplateRows: `repeat(${gridSize}, ${cellPixelSize}px)`,
          ["--city-grid-size" as string]: gridSize,
        }}
      >
        {Array.from({ length: gridSize }).map((_, y) => (
          <div className="city-2d-row" role="row" aria-rowindex={y + 1} key={`row-${y}`}>
            {Array.from({ length: gridSize }).map((__, x) => {
              const index = y * gridSize + x;
              const building = occupiedByCell.get(`${x},${y}`);
              const buildingName = building ? gameRules.buildings[building.buildingId].name : null;
              return (
                <Button
                  ref={element => { cellRefs.current[index] = element; }}
                  variant="ghost"
                  role="gridcell"
                  key={`${x},${y}`}
                  data-x={x}
                  data-y={y}
                  className={`city-2d-cell${hoveredCell?.x === x && hoveredCell.y === y ? " is-hovered" : ""}${building ? " is-occupied" : ""}`}
                  aria-colindex={x + 1}
                  aria-label={`Ô hàng ${y + 1}, cột ${x + 1}${building ? `, ${buildingName}, cấp ${building.level}` : ", ô trống"}`}
                  aria-selected={building?.buildingId === selectedBuildingId}
                  tabIndex={focusedCell === index ? 0 : -1}
                  onFocus={() => setFocusedCell(index)}
                  onClick={() => activateCell(x, y)}
                  onKeyDown={event => onCellKeyDown(event, index)}
                  onMouseEnter={() => setHoveredCell({ x, y })}
                  onMouseLeave={() => setHoveredCell(null)}
                />
              );
            })}
          </div>
        ))}

        {mode !== "view" && placementDraft && (() => {
          const dimensions = buildingDimensions(placementDraft.buildingId, placementDraft.rotation);
          const valid = placementIsValid(placementDraft, mode === "edit" ? placementDraft.buildingId : undefined);
          return <div
            data-city-fallback-ghost
            className={`city-2d-ghost ${valid ? "is-valid" : "is-invalid"}`}
            style={{
              left: `${placementDraft.x * cellPixelSize}px`,
              top: `${placementDraft.y * cellPixelSize}px`,
              width: `${dimensions.width * cellPixelSize}px`,
              height: `${dimensions.height * cellPixelSize}px`,
            }}
          >
            <img src={BUILDING_IMAGES[placementDraft.buildingId]} alt="" />
          </div>;
        })()}

        {buildings.map(building => {
          const dimensions = buildingDimensions(building.buildingId, building.rotation);
          const isSelected = building.buildingId === selectedBuildingId;
          const name = gameRules.buildings[building.buildingId].name;
          return (
            <div
              key={building.buildingId}
              className={`city-2d-building${isSelected ? " is-selected" : ""}`}
              aria-hidden="true"
              style={{
                left: `${building.x * cellPixelSize}px`,
                top: `${building.y * cellPixelSize}px`,
                width: `${dimensions.width * cellPixelSize}px`,
                height: `${dimensions.height * cellPixelSize}px`,
                transform: `rotate(${building.rotation}deg)`,
              }}
            >
              <img src={BUILDING_IMAGES[building.buildingId]} alt="" />
              <span title={`${name}, cấp ${building.level}`}>Cấp {building.level}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
};
