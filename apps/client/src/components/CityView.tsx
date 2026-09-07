import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildingDimensions,
  buildingIds,
  buildingOccupiedTiles,
  cityGridSize,
  cityRotations,
  factions,
  gameRules,
  isPlacementWithinBounds,
  type BuildingId,
  type BuildingPlacement,
  type City,
  type CityRotation,
  type FactionId,
} from "@kingdoms/shared";
import { useGame } from "../state.js";
import { affordable, buildQueueRoom, firstReason, notFrozen } from "../validation.js";
import { formatCost, resourceIcons, resourceLabels } from "../vocabulary.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";
import { isModalOpen } from "../ui/Modal.js";
import { PendingChip } from "./PendingChip.js";
import { MenuModal } from "./MenuModal.js";
import { PlayerHubModal, type HubMode } from "./PlayerHubModal.js";
import { City2DFallback } from "../city-3d/fallback.js";
import { isWebGL2Supported, loadCityAssets } from "../city-3d/loader.js";
import { createCityScene } from "../city-3d/scene.js";
import { graphicsQuality } from "../graphics.js";
import type {
  CityBuildingState,
  CityInteractionMode,
  CityQuality,
  CitySceneInstance,
} from "../city-3d/types.js";

const BUILD_QUEUE_LIMIT = 2;
const MAX_UNDO_STEPS = 20;

const buildingArt: Record<BuildingId, string> = {
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

interface CityViewProps {
  city: City;
  onClose: () => void;
}

function qualityForDevice(): CityQuality {
  const configured = graphicsQuality();
  return configured === "balanced" ? "medium" : configured;
}

function placementValid(
  placement: BuildingPlacement,
  size: number,
  buildings: BuildingPlacement[],
  exclude?: BuildingId,
): boolean {
  if (!isPlacementWithinBounds(placement, size)) return false;
  const occupied = new Set<string>();
  for (const building of buildings) {
    if (building.buildingId === exclude) continue;
    for (const tile of buildingOccupiedTiles(building)) occupied.add(`${tile.x},${tile.y}`);
  }
  return buildingOccupiedTiles(placement).every(tile => !occupied.has(`${tile.x},${tile.y}`));
}

function initialPlacement(buildingId: BuildingId, size: number, buildings: BuildingPlacement[]): BuildingPlacement {
  const dimensions = buildingDimensions(buildingId, 0);
  const centerX = Math.max(0, Math.floor((size - dimensions.width) / 2));
  const centerY = Math.max(0, size - dimensions.height - 2);
  const candidates: BuildingPlacement[] = [];
  for (let radius = 0; radius < size; radius += 1) {
    for (let y = 0; y <= size - dimensions.height; y += 1) {
      for (let x = 0; x <= size - dimensions.width; x += 1) {
        if (Math.abs(x - centerX) + Math.abs(y - centerY) !== radius) continue;
        candidates.push({ buildingId, x, y, rotation: 0 });
      }
    }
  }
  return candidates.find(candidate => placementValid(candidate, size, buildings))
    ?? { buildingId, x: 0, y: 0, rotation: 0 };
}

export function CityView({ city, onClose }: CityViewProps) {
  const { runCommand, addNotice, state, playerHub } = useGame();
  const factionId: FactionId = state.session?.player.factionId ?? "meridian";
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CitySceneInstance | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const historyMarker = useRef(`city-${city.id}-${Date.now()}`);

  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [fallbackReason, setFallbackReason] = useState<string | null>(() => isWebGL2Supported() ? null : "WebGL 2 không khả dụng.");
  const [mode, setMode] = useState<CityInteractionMode>("view");
  const [selectedBuildingId, setSelectedBuildingId] = useState<BuildingId | null>(null);
  const [placementDraft, setPlacementDraft] = useState<BuildingPlacement | null>(null);
  const [isDraftValid, setIsDraftValid] = useState(false);
  const [draftPlacements, setDraftPlacements] = useState<BuildingPlacement[]>(city.buildingPlots);
  const [undoStack, setUndoStack] = useState<BuildingPlacement[][]>([]);
  const [redoStack, setRedoStack] = useState<BuildingPlacement[][]>([]);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [isSubmittingBuild, setIsSubmittingBuild] = useState(false);
  const [hubMode, setHubMode] = useState<HubMode>();
  const [menuOpen, setMenuOpen] = useState(false);
  const quality = useMemo(qualityForDevice, []);

  const size = cityGridSize(city.buildings?.town_hall ?? 1);
  const queuedBuilds = useMemo(() => city.queues.filter(item => item.type === "build"), [city.queues]);
  const queuedBuildingIds = useMemo(() => new Set(queuedBuilds.map(item => item.buildingId)), [queuedBuilds]);
  const activePlacements = mode === "edit" ? draftPlacements : city.buildingPlots;

  const buildingStates: CityBuildingState[] = useMemo(() => activePlacements.map(plot => ({
    buildingId: plot.buildingId,
    level: Math.max(city.buildings[plot.buildingId] ?? 0, 1),
    x: plot.x,
    y: plot.y,
    rotation: (plot.rotation ?? 0) as CityRotation,
    isUpgrading: queuedBuildingIds.has(plot.buildingId),
  })), [activePlacements, city.buildings, queuedBuildingIds]);

  useEffect(() => {
    // React StrictMode mounts effects twice in development. Keep the city as a
    // single browser-history step in both development and production builds.
    if (window.history.state?.cityInteriorMarker !== historyMarker.current) {
      window.history.pushState({ cityInteriorMarker: historyMarker.current }, "", window.location.href);
    }
    const onPopState = () => closeRef.current();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [city.id]);

  const requestClose = useCallback(() => {
    if (window.history.state?.cityInteriorMarker === historyMarker.current) window.history.back();
    else closeRef.current();
  }, []);

  const cancelInteraction = useCallback(() => {
    if (mode === "place") {
      setMode("view");
      setPlacementDraft(null);
      setIsDraftValid(false);
      setSelectedBuildingId(null);
      return true;
    }
    if (selectedBuildingId) {
      setSelectedBuildingId(null);
      setPlacementDraft(null);
      return true;
    }
    if (mode === "edit") {
      setMode("view");
      setDraftPlacements(city.buildingPlots);
      setUndoStack([]);
      setRedoStack([]);
      return true;
    }
    return false;
  }, [city.buildingPlots, mode, selectedBuildingId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isModalOpen()) return;
      if (event.key === "Escape") {
        if (!cancelInteraction()) requestClose();
      }
      if (event.key === "Enter" && mode === "place" && isDraftValid) {
        document.querySelector<HTMLButtonElement>("[data-city-confirm-build]")?.click();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelInteraction, isDraftValid, mode, requestClose]);

  useEffect(() => {
    if (mode !== "edit") {
      setDraftPlacements(city.buildingPlots);
      setUndoStack([]);
      setRedoStack([]);
    }
  }, [city.buildingPlots, mode]);

  const handleSelectBuilding = useCallback((buildingId: BuildingId | null) => {
    if (mode === "place") return;
    setSelectedBuildingId(buildingId);
    if (mode === "edit" && buildingId) {
      const placement = draftPlacements.find(item => item.buildingId === buildingId) ?? null;
      setPlacementDraft(placement);
      setIsDraftValid(Boolean(placement));
    } else {
      setPlacementDraft(null);
    }
  }, [draftPlacements, mode]);

  const handlePlacementPreview = useCallback((placement: BuildingPlacement, valid: boolean) => {
    setPlacementDraft(placement);
    setIsDraftValid(valid);
  }, []);

  const handleBuildingMoved = useCallback((buildingId: BuildingId, x: number, y: number, rotation: CityRotation) => {
    if (mode !== "edit") return;
    if (queuedBuildingIds.has(buildingId)) {
      addNotice("Công trình đang thi công nên chưa thể di chuyển.", "error");
      return;
    }
    const placement = { buildingId, x, y, rotation };
    if (!placementValid(placement, size, draftPlacements, buildingId)) return;
    setUndoStack(previous => [...previous.slice(-(MAX_UNDO_STEPS - 1)), draftPlacements]);
    setRedoStack([]);
    setDraftPlacements(current => current.map(item => item.buildingId === buildingId ? placement : item));
    setPlacementDraft(placement);
    setIsDraftValid(true);
  }, [addNotice, draftPlacements, mode, queuedBuildingIds, size]);

  useEffect(() => {
    if (fallbackReason || !containerRef.current) return;
    let cancelled = false;
    loadCityAssets(progress => { if (!cancelled) setLoadProgress(progress); })
      .then(() => {
        if (cancelled || !containerRef.current) return;
        setIsLoading(false);
        sceneRef.current?.destroy();
        sceneRef.current = createCityScene(containerRef.current, {
          cityId: city.id,
          factionId,
          equipped: playerHub?.equipped,
          gridSize: size,
          townHallLevel: city.buildings?.town_hall ?? 1,
          buildings: buildingStates,
          selectedBuildingId,
          mode,
          placementDraft,
          quality,
          onSelectBuilding: handleSelectBuilding,
          onPlacementPreview: handlePlacementPreview,
          onBuildingMoved: handleBuildingMoved,
          onContextLost: () => setFallbackReason("Kết nối WebGL bị gián đoạn."),
          onZoomOutToWorld: requestClose,
        });
      })
      .catch(error => {
        console.error("Failed to load authored city assets", error);
        if (!cancelled) {
          setIsLoading(false);
          setFallbackReason("Không tải được bộ asset 3D.");
        }
      });
    return () => {
      cancelled = true;
      sceneRef.current?.destroy();
      sceneRef.current = null;
    };
  }, [fallbackReason]); // Scene lifecycle is intentionally tied only to fallback state.

  useEffect(() => {
    sceneRef.current?.updateOptions({
      cityId: city.id,
      factionId,
      equipped: playerHub?.equipped,
      gridSize: size,
      townHallLevel: city.buildings?.town_hall ?? 1,
      buildings: buildingStates,
      selectedBuildingId,
      mode,
      placementDraft,
      quality,
      onSelectBuilding: handleSelectBuilding,
      onPlacementPreview: handlePlacementPreview,
      onBuildingMoved: handleBuildingMoved,
    });
  }, [buildingStates, city.buildings, city.id, factionId, handleBuildingMoved, handlePlacementPreview, handleSelectBuilding, mode, placementDraft, playerHub?.equipped, quality, selectedBuildingId, size]);

  const enterPlacement = (buildingId: BuildingId) => {
    const draft = initialPlacement(buildingId, size, city.buildingPlots);
    setMode("place");
    setSelectedBuildingId(buildingId);
    setPlacementDraft(draft);
    setIsDraftValid(placementValid(draft, size, city.buildingPlots));
  };

  const enterEdit = () => {
    setMode("edit");
    setSelectedBuildingId(null);
    setPlacementDraft(null);
    setDraftPlacements(city.buildingPlots);
  };

  const rotateDraft = () => {
    if (!placementDraft) return;
    if (mode === "edit" && queuedBuildingIds.has(placementDraft.buildingId)) return;
    const current = (placementDraft.rotation ?? 0) as CityRotation;
    const rotation = cityRotations[(cityRotations.indexOf(current) + 1) % cityRotations.length];
    const next = { ...placementDraft, rotation };
    const valid = placementValid(next, size, mode === "edit" ? draftPlacements : city.buildingPlots, mode === "edit" ? next.buildingId : undefined);
    setPlacementDraft(next);
    setIsDraftValid(valid);
    if (mode === "edit" && valid) handleBuildingMoved(next.buildingId, next.x, next.y, rotation);
  };

  const selectedRule = selectedBuildingId ? gameRules.buildings[selectedBuildingId] : null;
  const selectedLevel = selectedBuildingId ? city.buildings[selectedBuildingId] ?? 0 : 0;
  const selectedQueue = selectedBuildingId ? queuedBuilds.find(queue => queue.buildingId === selectedBuildingId) : null;
  const selectedPlacement = activePlacements.find(item => item.buildingId === selectedBuildingId);
  const commandReason = !selectedRule
    ? "Hãy chọn một công trình."
    : selectedQueue
      ? "Công trình này đang được thi công."
      : firstReason(notFrozen(city), buildQueueRoom(city, BUILD_QUEUE_LIMIT), affordable(city, selectedRule.cost));

  const submitBuild = async () => {
    if (!selectedBuildingId || !selectedRule || commandReason || !placementDraft || !isDraftValid) return;
    setIsSubmittingBuild(true);
    try {
      const response = await runCommand({
        kind: "build",
        label: `Xây ${selectedRule.name}`,
        path: "/api/commands/build",
        body: {
          cityId: city.id,
          buildingId: selectedBuildingId,
          queueType: "build",
          plotX: placementDraft.x,
          plotY: placementDraft.y,
          plotRotation: placementDraft.rotation ?? 0,
        },
      });
      if (response.result === "accepted" || response.result === "already_processed") {
        setMode("view");
        setPlacementDraft(null);
        addNotice(`Đã đặt ${selectedRule.name} vào hàng xây dựng.`, "info");
      }
    } finally {
      setIsSubmittingBuild(false);
    }
  };

  const submitUpgrade = () => {
    if (!selectedBuildingId || !selectedRule || selectedLevel === 0 || commandReason) return;
    void runCommand({
      kind: "build",
      label: `Nâng ${selectedRule.name}`,
      path: "/api/commands/build",
      body: { cityId: city.id, buildingId: selectedBuildingId, queueType: "build" },
    }).catch(() => undefined);
  };

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack(stack => stack.slice(0, -1));
    setRedoStack(stack => [draftPlacements, ...stack]);
    setDraftPlacements(previous);
    setPlacementDraft(null);
    setSelectedBuildingId(null);
  };

  const redo = () => {
    const next = redoStack[0];
    if (!next) return;
    setRedoStack(stack => stack.slice(1));
    setUndoStack(stack => [...stack, draftPlacements]);
    setDraftPlacements(next);
    setPlacementDraft(null);
    setSelectedBuildingId(null);
  };

  const cancelEdit = () => {
    setMode("view");
    setSelectedBuildingId(null);
    setPlacementDraft(null);
    setDraftPlacements(city.buildingPlots);
    setUndoStack([]);
    setRedoStack([]);
  };

  const saveLayout = async () => {
    setIsSavingLayout(true);
    try {
      const response = await runCommand({
        kind: "city_layout",
        label: "Lưu quy hoạch nội thành",
        path: "/api/commands/city-layout",
        body: {
          cityId: city.id,
          layoutVersion: 2,
          expectedRevision: city.cityLayoutRevision ?? 0,
          placements: draftPlacements,
        },
      });
      if (response.result === "accepted" || response.result === "already_processed") {
        addNotice("Đã lưu quy hoạch nội thành.", "info");
        setMode("view");
        setSelectedBuildingId(null);
        setPlacementDraft(null);
      }
    } finally {
      setIsSavingLayout(false);
    }
  };

  const retry3D = () => {
    setFallbackReason(null);
    setIsLoading(true);
    setLoadProgress(1);
  };

  const nextTownHallSize = cityGridSize((city.buildings?.town_hall ?? 1) + 1);

  return (
    <>
    <div className={`city-view city-view--${mode}`} data-testid="city-view" data-city-mode={mode}>
      <div ref={containerRef} className="city-view-canvas" data-testid="city-view-canvas">
        {fallbackReason && (
          <div data-testid="city-view-fallback" className="city-view-fallback-shell">
            <City2DFallback
              gridSize={size}
              buildings={buildingStates}
              selectedBuildingId={selectedBuildingId}
              mode={mode}
              placementDraft={placementDraft}
              onSelectBuilding={handleSelectBuilding}
              onPlacementPreview={handlePlacementPreview}
              onBuildingMoved={handleBuildingMoved}
            />
            <div className="city-view-fallback-message">
              <strong>Đang dùng bản đồ 2D dự phòng</strong>
              <span>{fallbackReason}</span>
              <Button variant="secondary" density="compact" onClick={retry3D}>Thử lại 3D</Button>
            </div>
          </div>
        )}
      </div>

      {isLoading && !fallbackReason && (
        <div className="city-view-loading">
          <div className="city-view-loading-box">
            <span className="city-view-loading-kicker">ĐANG DỰNG THÀNH</span>
            <h3>Mở nội thành 3D</h3>
            <div className="city-view-progress-bar"><div className="city-view-progress-fill" style={{ width: `${Math.round(loadProgress * 100)}%` }} /></div>
            <span className="kom-num">{Math.round(loadProgress * 100)}%</span>
          </div>
        </div>
      )}

      <header className="city-view-topbar">
        <div className="city-view-topbar-left">
          <Button variant="secondary" density="compact" onClick={requestClose} aria-label="Quay lại bản đồ">← Bản đồ</Button>
          <div className="city-view-title">
            <small>NỘI THÀNH</small>
            <h2>{city.name}</h2>
            <span className="city-view-badge kom-num">Tòa thị chính {city.buildings?.town_hall ?? 1} · Khu thành {size}×{size}</span>
          </div>
        </div>
        <div className="city-view-topbar-center">
          <div className="city-view-resources">
            {(["food", "wood", "stone", "iron"] as const).map(key => <span className={`city-view-resource city-view-resource--${key}`} key={key} title={resourceLabels[key]}><Icon name={resourceIcons[key]} size="sm" /><strong className="kom-num">{city.resources?.[key] ?? 0}</strong></span>)}
          </div>
        </div>
        <div className="city-view-topbar-right">
          <span className="city-view-quality">{factions[factionId].name} · 3D · {quality.toUpperCase()}</span>
          <span className="city-view-queue-status">Đội thợ <strong className="kom-num">{queuedBuilds.length}/{BUILD_QUEUE_LIMIT}</strong></span>
          <Button variant="ghost" density="compact" onClick={() => setHubMode("profile")}>Hồ sơ</Button>
          <Button variant="ghost" density="compact" onClick={() => setHubMode("inventory")}>Túi</Button>
          <Button variant="ghost" density="compact" onClick={() => setHubMode("shop")}>Shop</Button>
          <Button variant="ghost" density="compact" onClick={() => setMenuOpen(true)}>Menu</Button>
          {mode === "view" && <Button variant="primary" density="compact" onClick={() => {
            const next = buildingIds.find(buildingId => (city.buildings[buildingId] ?? 0) === 0 && !queuedBuildingIds.has(buildingId));
            if (next) enterPlacement(next);
          }}>Xây dựng</Button>}
          {mode === "view" && <Button variant="secondary" density="compact" onClick={enterEdit}>⊞ Sắp xếp thành</Button>}
          {mode === "edit" && <Button variant="ghost" density="compact" onClick={cancelEdit}>Thoát</Button>}
        </div>
      </header>

      {mode === "place" && placementDraft && selectedRule && (
        <div className="city-view-placement-toolbar" role="toolbar" aria-label="Đặt công trình">
          <div>
            <small>ĐANG ĐẶT CÔNG TRÌNH</small>
            <strong>{selectedRule.name}</strong>
            <span className="city-view-placement-help">Chạm mặt đất để chốt vị trí, kéo để điều chỉnh</span>
            <span className={isDraftValid ? "is-valid" : "is-invalid"}>
              {isDraftValid ? `Ô (${placementDraft.x}, ${placementDraft.y}) · ${placementDraft.rotation ?? 0}°` : "Vị trí không hợp lệ"}
            </span>
          </div>
          <div className="city-view-placement-actions">
            <Button variant="secondary" density="compact" onClick={rotateDraft}>⟳ Xoay</Button>
            <Button variant="ghost" density="compact" onClick={cancelInteraction}>Hủy</Button>
            <Button
              variant="primary"
              density="compact"
              data-city-confirm-build
              disabled={!isDraftValid || Boolean(commandReason) || isSubmittingBuild}
              reason={!isDraftValid ? "Hãy chọn vị trí không chồng lấn trong tường thành" : commandReason ?? undefined}
              onClick={submitBuild}
            >
              {isSubmittingBuild ? "Đang gửi..." : `Đặt & xây · ${formatCost(selectedRule.cost)}`}
            </Button>
          </div>
        </div>
      )}

      {mode === "edit" && (
        <div className="city-view-edit-toolbar">
          <div className="city-view-edit-hint">Chọn công trình, kéo để di chuyển · R để xoay · ô chỉ hiện quanh vị trí đang sửa</div>
          <div className="city-view-edit-actions">
            <Button
              variant="secondary"
              density="compact"
              disabled={!placementDraft || (selectedBuildingId ? queuedBuildingIds.has(selectedBuildingId) : false)}
              reason={!placementDraft ? "Hãy chọn một công trình trước" : "Không thể xoay công trình đang thi công"}
              onClick={rotateDraft}
            >⟳ Xoay (R)</Button>
            <Button variant="secondary" density="compact" disabled={!undoStack.length} reason="Chưa có thay đổi để hoàn tác" onClick={undo}>↶ Hoàn tác</Button>
            <Button variant="secondary" density="compact" disabled={!redoStack.length} reason="Chưa có thay đổi để làm lại" onClick={redo}>↷ Làm lại</Button>
            <Button variant="ghost" density="compact" onClick={() => { setUndoStack(stack => [...stack, draftPlacements]); setDraftPlacements(city.buildingPlots); }}>Đặt lại</Button>
            <Button variant="ghost" density="compact" onClick={cancelEdit}>Hủy</Button>
            <Button variant="primary" density="compact" disabled={isSavingLayout} reason="Đang lưu quy hoạch" onClick={saveLayout}>{isSavingLayout ? "Đang lưu..." : "Lưu quy hoạch"}</Button>
          </div>
        </div>
      )}

      <footer className="city-view-bottom-dock">
        <div className="city-view-building-chips" role="toolbar" aria-label="Danh sách công trình">
          {buildingIds.map(buildingId => {
            const rule = gameRules.buildings[buildingId];
            const level = city.buildings[buildingId] ?? 0;
            const queued = queuedBuildingIds.has(buildingId);
            return (
              <Button
                key={buildingId}
                variant="secondary"
                className={`city-view-chip ${selectedBuildingId === buildingId ? "is-selected" : ""} ${queued ? "is-building" : ""}`}
                onClick={() => {
                  if (mode === "edit") {
                    handleSelectBuilding(buildingId);
                    sceneRef.current?.focusBuilding(buildingId);
                  } else if (level === 0 && !queued) {
                    enterPlacement(buildingId);
                  } else {
                    setMode("view");
                    handleSelectBuilding(buildingId);
                    sceneRef.current?.focusBuilding(buildingId);
                  }
                }}
                aria-pressed={selectedBuildingId === buildingId}
              >
                <img src={buildingArt[buildingId]} alt="" aria-hidden="true" />
                <div className="city-view-chip-info">
                  <strong>{rule.name}</strong>
                  <small className="kom-num">{queued ? "Đang xây..." : level ? `Cấp ${level}` : "+ Xây mới"}</small>
                </div>
              </Button>
            );
          })}
        </div>
      </footer>

      {mode === "view" && selectedBuildingId && selectedRule && selectedLevel > 0 && (
        <aside className="city-view-inspector">
          <div className="city-view-inspector-header">
            <div className="city-view-inspector-title">
              <img src={buildingArt[selectedBuildingId]} alt="" aria-hidden="true" />
              <div><h3>{selectedRule.name}</h3><span className="kom-num">Cấp hiện tại: {selectedLevel}</span></div>
            </div>
            <Button variant="ghost" density="compact" className="city-view-inspector-close" onClick={() => handleSelectBuilding(null)} aria-label="Đóng chi tiết">×</Button>
          </div>
          <p className="city-view-inspector-desc">{selectedRule.description}</p>
          {selectedBuildingId === "town_hall" && (
            <p className="city-view-inspector-note">Nâng cấp mở rộng tường thành tới <strong className="kom-num">{nextTownHallSize}×{nextTownHallSize}</strong>.</p>
          )}
          {selectedPlacement && (
            <div className="city-view-inspector-coords"><span>Vị trí: ({selectedPlacement.x}, {selectedPlacement.y})</span><span>Góc: {selectedPlacement.rotation ?? 0}°</span></div>
          )}
          <div className="city-view-inspector-footer">
            <div className="city-view-inspector-cost"><small>Chi phí nâng cấp</small><span>{formatCost(selectedRule.cost)}</span></div>
            <Button variant="primary" disabled={Boolean(commandReason)} reason={commandReason ?? undefined} onClick={submitUpgrade}>
              {selectedQueue ? "Đang thi công..." : `Nâng lên cấp ${selectedLevel + 1}`}
            </Button>
          </div>
          <PendingChip kind="build" match={{ buildingId: selectedBuildingId }} />
        </aside>
      )}
    </div>
    {hubMode && <PlayerHubModal mode={hubMode} onClose={() => setHubMode(undefined)} />}
    {menuOpen && <MenuModal onClose={() => setMenuOpen(false)} />}
    </>
  );
}
