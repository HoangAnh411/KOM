import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import type { WorldSnapshot } from "@kingdoms/shared";
import { mapExtent } from "../map-geometry.js";
import type { MapSelection, WorldMap } from "../map-contract.js";
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

  // The Three.js world is dynamically imported after login, keeping WebGL and
  // model decoders off the authentication screen.
  useEffect(() => {
    if (!state.snapshot || !mapContainer.current) return;
    let cancelled = false;
    void import("../world-3d/scene.js").then(({ createWorld3DMap }) => {
      if (cancelled) return;
      map.current?.destroy();
      map.current = createWorld3DMap(mapContainer.current!, state.snapshot!, session.player.id, handleSelect, openCityInterior, status => setAssetError(status === "failed"), playerHub?.equipped);
      map.current.setInteraction(interactionRef.current);
    });
    return () => { cancelled = true; map.current?.destroy(); map.current = undefined; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token, handleSelect, openCityInterior]);

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

  return <div ref={mapContainer} className="map" data-testid="world-map">
    {assetError && <div className="map-asset-error" role="alert"><strong>Khong tai duoc canh quan</strong><span>Ban co the thu lai tai model 3D.</span><Button variant="secondary" density="compact" onClick={() => { setAssetError(false); map.current?.retryAssets?.(); }}>Thu lai</Button></div>}
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
        <Icon name="crosshair" size="sm" />Về giữa map
      </Button>
    </div>
    <StrategicMinimap snapshot={state.snapshot} playerId={session.player.id} selection={selection} onLocate={(x, y) => map.current?.focusCity(x, y)} />
  </div>;
}

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
  const point = (x: number, y: number) => ({ x: (x + .5) * 144 / 256, y: (y + .5) * 144 / 256 });
  const target = selection?.kind === "tile" ? selection : selection && snapshot ? snapshot.cities.find(city => city.id === selection.id) ?? snapshot.armies.find(army => army.id === selection.id) : undefined;
  const locate = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onLocate(Math.round((event.clientX - rect.left) / rect.width * 256), Math.round((event.clientY - rect.top) / rect.height * 256));
  };
  const coordinate = !snapshot ? "--, --" : selection?.kind === "tile" ? `${selection.x}, ${selection.y}` : selection ? (() => { const target = snapshot.cities.find(city => city.id === selection.id) ?? snapshot.armies.find(army => army.id === selection.id); return target ? `${target.x}, ${target.y}` : "--, --"; })() : "--, --";
  return <aside className="strategic-minimap" aria-label="Minimap" data-testid="strategic-minimap">
    <div className="strategic-minimap__head"><strong>Minimap</strong><span className="kom-num">{coordinate}</span></div>
    <svg viewBox="0 0 144 144" role="img" aria-label="Định vị trên bản đồ" onClick={locate}>
      <rect width="144" height="144" fill="#294b43" />
      {Array.from({ length: resolution * resolution }, (_, index) => {
        const x = index % resolution; const y = Math.floor(index / resolution);
        return <rect key={`${x}:${y}`} x={x * 144 / resolution} y={y * 144 / resolution} width={144 / resolution + 1} height={144 / resolution + 1} fill={explored(x, y) ? "rgba(208,187,116,.2)" : "rgba(4,12,18,.78)"} />;
      })}
      {snapshot?.cities.map(city => {
        const cx = Math.floor(city.x * resolution / 256); const cy = Math.floor(city.y * resolution / 256);
        if (city.playerId !== playerId && !explored(cx, cy)) return null;
        const marker = point(city.x, city.y);
        return <rect key={city.id} x={marker.x - 2} y={marker.y - 2} width="4" height="4" fill={city.playerId === playerId ? "#55d1d0" : "#e17b58"} />;
      })}
      {snapshot?.armies.filter(army => army.ownerPlayerId === playerId).map(army => { const marker = point(army.x, army.y); return <circle key={army.id} cx={marker.x} cy={marker.y} r="1.8" fill="#f2d078" />; })}
      {target && <rect x={point(target.x, target.y).x - 4} y={point(target.x, target.y).y - 4} width="8" height="8" fill="none" stroke="#fff5d6" strokeWidth="1.5" />}
    </svg>
  </aside>;
}
