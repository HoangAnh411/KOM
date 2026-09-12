import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { WorldSnapshot } from "@kingdoms/shared";
import { mapExtent } from "../map-geometry.js";
import type { MapSelection, WorldMap } from "../map-contract.js";
import { createWorld2DMap } from "../world-2d.js";
import { chooseRenderer } from "../world-renderer.js";
import { armyLabel } from "../vocabulary.js";
import { useGame } from "../state.js";
import { panelForSelection } from "../tray-groups.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";

/** The centre of gravity. Deliberately props-free and never re-keyed: the whole
 *  point of the Situation Room shell is that opening a column is a CSS grid
 *  change, so this component must stay in a stable position in the tree with a
 *  stable identity. If it were remounted, `createWorldMap` would run again and
 *  the player would lose camera and selection every time a panel opened.
 *
 *  The Three.js renderer observes its container directly for resizing. */
export function MapSurface() {
  const { state, addNotice, setSelection, selection, interaction, cancelOrder, runCommand, setActivePanel, openCityInterior, cityInteriorId, playerHub } = useGame();
  const session = state.session!;
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<WorldMap>();
  const [assetError, setAssetError] = useState(false);
  const [using2D, setUsing2D] = useState(false);
  const interactionRef = useRef(interaction);
  const snapshotRef = useRef(state.snapshot);
  /** The last selection this component *made*. Everything else in the client that
   *  sets one — "Xem trên bản đồ" in the army list — is a request to look at
   *  something, and the camera has to move for that to mean anything; a click on
   *  the map is already looking at it. Comparing against this is what tells the
   *  two apart without a second piece of state to keep in sync. */
  const pickedHere = useRef<MapSelection | undefined>(selection);
  useEffect(() => { interactionRef.current = interaction; snapshotRef.current = state.snapshot; });

  const handleSelect = useCallback((picked: MapSelection | undefined) => {
    const snap = snapshotRef.current;
    const mode = interactionRef.current;
    if (mode.kind !== "idle") {
      if (mode.kind === "move" && picked) {
        const position = picked.kind === "tile"
          ? { x: picked.x, y: picked.y }
          : (snap?.armies.find(army => army.id === picked.id) ?? snap?.cities.find(city => city.id === picked.id));
        if (position && position.x !== undefined && position.y !== undefined) {
          runCommand({ kind: "move_army", label: "Lệnh di chuyển", path: "/api/commands/move-army", body: { armyId: mode.armyId, targetX: position.x, targetY: position.y } })
            .then(response => { if (response.result === "accepted") addNotice("Lệnh di chuyển đã ghi nhận.", "info"); }).catch(() => undefined);
        }
        cancelOrder();
        return;
      }
      if (mode.kind === "attack" && picked?.kind === "army") {
        runCommand({ kind: "attack", label: "Lệnh tấn công", path: "/api/commands/attack", body: { armyId: mode.armyId, targetArmyId: picked.id } })
          .then(response => { if (response.result === "accepted") addNotice("Lệnh tấn công đã ghi nhận.", "info"); }).catch(() => undefined);
        cancelOrder();
        return;
      }
      cancelOrder();
    }
    pickedHere.current = picked;
    setSelection(picked);
    // A city click is selection only. Entering the player's city is a camera
    // action (zooming deep over it) or the explicit accessible tray command.
    // Clicking something of your own on the map moves the kingdom column's nav to
    // the panel that commands it, so the two halves of the HUD agree about what
    // the player is looking at. The panel is decided by the same table the tray
    // reads, and only for things the player owns — see `panelForSelection`.
    //
    // The snapshot comes from the ref: reading `state.snapshot` here would make
    // this callback change on every tick, and the renderer init effect is keyed
    // on its identity, so the map would be torn down and rebuilt every second.
    const panel = panelForSelection(picked, snap, session.player.id);
    if (panel) setActivePanel(panel);
  }, [runCommand, setSelection, cancelOrder, addNotice, setActivePanel, openCityInterior, session.player.id]);

  const onRendererFailure = useCallback((error: unknown) => {
    // Error details stay out of player-facing copy; the global diagnostics handler
    // records the rejected import/constructor without credentials.
    console.error("Không thể khởi tạo bản đồ 3D; chuyển sang bản đồ 2D.", error);
  }, []);

  // Three.js remains off the authentication bundle. Both an import rejection and
  // a synchronous WebGLRenderer constructor failure take the same tested route to
  // the dependency-free renderer, preserving every WorldMap operation.
  useEffect(() => {
    const initial = state.snapshot;
    const container = mapContainer.current;
    if (!initial || !container) return;
    let cancelled = false;
    const install2D = () => {
      const latest = snapshotRef.current;
      if (!latest || cancelled) throw new Error("World snapshot is unavailable");
      const fallback = createWorld2DMap(container, latest, session.player.id, handleSelect);
      fallback.setInteraction(interactionRef.current);
      fallback.update(latest, pickedHere.current, playerHub?.equipped);
      return fallback;
    };
    const handleAssetState = (status: "loading" | "ready" | "failed") => {
      if (status !== "failed" || cancelled || map.current?.retryAssets === undefined) return;
      console.error("Không tải được asset bản đồ 3D; chuyển sang bản đồ 2D.");
      const fallback = install2D();
      map.current?.destroy();
      map.current = fallback;
      setUsing2D(true);
      setAssetError(false);
    };
    void chooseRenderer<WorldMap>(
      async () => {
        const { createWorld3DMap } = await import("../world-3d/scene.js");
        return () => createWorld3DMap(container, initial, session.player.id, handleSelect, openCityInterior, handleAssetState, playerHub?.equipped);
      },
      install2D,
      onRendererFailure,
      () => cancelled,
    ).then(choice => {
      if (!choice || cancelled) { choice?.renderer.destroy(); return; }
      map.current?.destroy();
      map.current = choice.renderer;
      setUsing2D(choice.fallback);
      setAssetError(false);
      choice.renderer.setInteraction(interactionRef.current);
      choice.renderer.update(snapshotRef.current!, pickedHere.current, playerHub?.equipped);
    }).catch(error => {
      // Canvas 2D failing as well is an exceptional platform failure. The React
      // boundary can recover the shell and diagnostics preserve the safe detail.
      console.error("Không thể khởi tạo trình dựng bản đồ.", error);
      setAssetError(true);
    });
    return () => { cancelled = true; map.current?.destroy(); map.current = undefined; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token, handleSelect, openCityInterior, onRendererFailure]);

  useEffect(() => {
    if (!state.snapshot) return;
    map.current?.update(state.snapshot, selection, playerHub?.equipped);
    // A selection from somewhere else in the HUD: centre on it, or the highlight
    // lands off screen and the control that asked for it looks broken. Note this
    // runs on every snapshot too, and the ref makes all of those no-ops — without
    // it the camera would snap back to the selection on every tick.
    if (selection === pickedHere.current) return;
    pickedHere.current = selection;
    const spot = selection?.kind === "tile" ? selection
      : selection?.kind === "army" ? state.snapshot.armies.find(army => army.id === selection.id)
      : selection ? state.snapshot.cities.find(city => city.id === selection.id)
      : undefined;
    // Named for its first caller; it is "put this grid position in the middle".
    if (spot) map.current?.focusCity(spot.x, spot.y);
  }, [playerHub?.equipped, state.snapshot, selection]);
  useEffect(() => { map.current?.setInteraction(interaction); }, [interaction]);
  const isCityOpen = Boolean(cityInteriorId);
  useEffect(() => {
    map.current?.setActive?.(!isCityOpen);
  }, [isCityOpen]);

  const retry3D = useCallback(() => {
    const initial = snapshotRef.current;
    const container = mapContainer.current;
    if (!initial || !container) return;
    setAssetError(false);
    if (!using2D) { map.current?.retryAssets?.(); return; }
    void import("../world-3d/scene.js").then(({ createWorld3DMap }) => {
      const next = createWorld3DMap(container, initial, session.player.id, handleSelect, openCityInterior, status => {
        if (status !== "failed") return;
        const fallback = createWorld2DMap(container, initial, session.player.id, handleSelect);
        fallback.setInteraction(interactionRef.current);
        fallback.update(snapshotRef.current ?? initial, pickedHere.current, playerHub?.equipped);
        map.current?.destroy();
        map.current = fallback;
        setUsing2D(true);
      }, playerHub?.equipped);
      next.setInteraction(interactionRef.current);
      next.update(initial, pickedHere.current, playerHub?.equipped);
      map.current?.destroy();
      map.current = next;
      setUsing2D(false);
    }).catch(error => {
      console.error("Không thể khởi tạo lại bản đồ 3D; tiếp tục dùng bản đồ 2D.", error);
      setUsing2D(true);
    });
  }, [handleSelect, openCityInterior, playerHub?.equipped, session.player.id, using2D]);

  return <div ref={mapContainer} className="map" data-testid="world-map">
    {using2D && <div className="map-asset-error" role="status"><strong>Đang dùng bản đồ 2D dự phòng</strong><span>Bản đồ vẫn hỗ trợ chọn, kéo, thu phóng và ra lệnh.</span><Button variant="secondary" density="compact" onClick={retry3D}>Thử lại 3D</Button></div>}
    {assetError && !using2D && <div className="map-asset-error" role="alert"><strong>Không tải được cảnh quan</strong><span>Bạn có thể thử tải lại mô hình 3D.</span><Button variant="secondary" density="compact" onClick={retry3D}>Thử lại</Button></div>}
    {/* Two camera controls, and no new method on `WorldMap` for either: both are
        `focusCity`, which is "put this grid position in the middle" under a name
        from its first caller. The second one exists because the map can be panned
        and zoomed with nothing selected — fully zoomed out on the far edge of the
        world there was no way back except reloading, and "my city" is not the same
        answer as "the whole world", which is what you want after losing one. */}
    <div className="map-toolbar">
      <Button density="compact" onClick={() => {
        const city = state.snapshot?.cities.find(item => item.playerId === session.player.id);
        if (city && map.current) map.current.focusCity(city.x, city.y);
      }}><Icon name="city" size="sm" />Về thành phố của tôi</Button>
      <Button density="compact" onClick={() => map.current?.focusCity(mapExtent / 2, mapExtent / 2)}>
        <Icon name="crosshair" size="sm" />Về giữa bản đồ
      </Button>
    </div>
    <WorldMapAlternatives snapshot={state.snapshot} playerId={session.player.id} onSelect={picked => { handleSelect(picked); map.current?.focusCity(picked.x, picked.y); }} />
    <StrategicMinimap snapshot={state.snapshot} playerId={session.player.id} selection={selection} onLocate={(x, y) => map.current?.focusCity(x, y)} />
  </div>;
}

function WorldMapAlternatives({ snapshot, playerId, onSelect }: {
  snapshot: WorldSnapshot | undefined;
  playerId: string;
  onSelect: (selection: MapSelection & { x: number; y: number }) => void;
}) {
  if (!snapshot) return null;
  const cities = snapshot.cities.filter(city => city.playerId === playerId || city.visibility !== "unknown");
  const armies = snapshot.armies.filter(army => army.ownerPlayerId === playerId && army.strength > 0);
  return <details className="world-map-alternatives">
    <summary>Điều hướng bản đồ bằng bàn phím</summary>
    <div className="world-map-alternatives__list" role="list" aria-label="Địa điểm và quân đội">
      {cities.map(city => <Button key={`city:${city.id}`} variant="ghost" density="compact" className="world-map-alternatives__item" onClick={() => onSelect({ kind: "city", id: city.id, x: city.x, y: city.y })}>
        Thành phố {city.name}, tọa độ {city.x}, {city.y}{city.playerId === playerId ? ", của bạn" : ""}
      </Button>)}
      {armies.map(army => <Button key={`army:${army.id}`} variant="ghost" density="compact" className="world-map-alternatives__item" onClick={() => onSelect({ kind: "army", id: army.id, x: army.x, y: army.y })}>
        {armyLabel(army)}, sức mạnh {army.strength}, tọa độ {army.x}, {army.y}
      </Button>)}
    </div>
  </details>;
}

const clampCoordinate = (value: number): number => Math.max(0, Math.min(mapExtent - 1, Math.round(value)));

function StrategicMinimap({ snapshot, playerId, selection, onLocate }: {
  snapshot: WorldSnapshot | undefined;
  playerId: string;
  selection: MapSelection | undefined;
  onLocate: (x: number, y: number) => void;
}) {
  const resolution = snapshot?.exploration.resolution ?? 16;
  let mask = new Uint8Array();
  if (snapshot) {
    try { mask = Uint8Array.from(atob(snapshot.exploration.encodedMask), character => character.charCodeAt(0)); } catch { /* Invalid masks remain covered. */ }
  }
  const explored = (x: number, y: number) => Boolean(mask.length && (mask[(y * resolution + x) >> 3]! & (1 << ((y * resolution + x) & 7))));
  const point = (x: number, y: number) => ({ x: (x + .5) * 144 / mapExtent, y: (y + .5) * 144 / mapExtent });
  const target = selection?.kind === "tile" ? selection : selection && snapshot ? snapshot.cities.find(city => city.id === selection.id) ?? snapshot.armies.find(army => army.id === selection.id) : undefined;
  const targetKey = selection ? `${selection.kind}:${selection.kind === "tile" ? `${selection.x}:${selection.y}` : selection.id}` : "center";
  const keyboardPosition = useRef({ key: targetKey, x: target?.x ?? mapExtent / 2, y: target?.y ?? mapExtent / 2 });
  if (keyboardPosition.current.key !== targetKey) keyboardPosition.current = { key: targetKey, x: target?.x ?? mapExtent / 2, y: target?.y ?? mapExtent / 2 };
  const locate = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onLocate(Math.round((event.clientX - rect.left) / rect.width * mapExtent), Math.round((event.clientY - rect.top) / rect.height * mapExtent));
  };
  const locateByKeyboard = (event: KeyboardEvent<SVGSVGElement>) => {
    const selectedPosition = keyboardPosition.current;
    const step = event.shiftKey ? 8 : 1;
    const delta = event.key === "ArrowLeft" ? { x: -step, y: 0 }
      : event.key === "ArrowRight" ? { x: step, y: 0 }
      : event.key === "ArrowUp" ? { x: 0, y: -step }
      : event.key === "ArrowDown" ? { x: 0, y: step }
      : null;
    if (delta) {
      event.preventDefault();
      const x = clampCoordinate(selectedPosition.x + delta.x);
      const y = clampCoordinate(selectedPosition.y + delta.y);
      keyboardPosition.current = { key: targetKey, x, y };
      onLocate(x, y);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onLocate(selectedPosition.x, selectedPosition.y);
    } else if (event.key === "Home") {
      event.preventDefault();
      keyboardPosition.current = { key: targetKey, x: mapExtent / 2, y: mapExtent / 2 };
      onLocate(mapExtent / 2, mapExtent / 2);
    }
  };
  const coordinate = !snapshot ? "--, --" : selection?.kind === "tile" ? `${selection.x}, ${selection.y}` : selection ? (() => { const target = snapshot.cities.find(city => city.id === selection.id) ?? snapshot.armies.find(army => army.id === selection.id); return target ? `${target.x}, ${target.y}` : "--, --"; })() : "--, --";
  return <aside className="strategic-minimap" aria-label="Minimap" data-testid="strategic-minimap">
    <div className="strategic-minimap__head"><strong>Minimap</strong><span className="kom-num">{coordinate}</span></div>
    <svg viewBox="0 0 144 144" role="button" tabIndex={0} aria-label="Định vị trên bản đồ. Dùng phím mũi tên để di chuyển, Shift để đi tám ô, Home để về giữa." onClick={locate} onKeyDown={locateByKeyboard}>
      <rect width="144" height="144" fill="#294b43" />
      {Array.from({ length: resolution * resolution }, (_, index) => {
        const x = index % resolution; const y = Math.floor(index / resolution);
        return <rect key={`${x}:${y}`} x={x * 144 / resolution} y={y * 144 / resolution} width={144 / resolution + 1} height={144 / resolution + 1} fill={explored(x, y) ? "rgba(208,187,116,.2)" : "rgba(4,12,18,.78)"} />;
      })}
      {snapshot?.cities.map(city => {
        const cx = Math.floor(city.x * resolution / mapExtent); const cy = Math.floor(city.y * resolution / mapExtent);
        if (city.playerId !== playerId && !explored(cx, cy)) return null;
        const marker = point(city.x, city.y);
        return <rect key={city.id} x={marker.x - 2} y={marker.y - 2} width="4" height="4" fill={city.playerId === playerId ? "#55d1d0" : "#e17b58"} />;
      })}
      {snapshot?.armies.filter(army => army.ownerPlayerId === playerId).map(army => { const marker = point(army.x, army.y); return <circle key={army.id} cx={marker.x} cy={marker.y} r="1.8" fill="#f2d078" />; })}
      {target && <rect x={point(target.x, target.y).x - 4} y={point(target.x, target.y).y - 4} width="8" height="8" fill="none" stroke="#fff5d6" strokeWidth="1.5" />}
    </svg>
  </aside>;
}
