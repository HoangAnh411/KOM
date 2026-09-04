import { useCallback, useEffect, useRef } from "react";
import type { MapSelection, WorldMap } from "../map.js";
import { useGame } from "../state.js";

/** The centre of gravity. Deliberately props-free and never re-keyed: the whole
 *  point of the Situation Room shell is that opening a column is a CSS grid
 *  change, so this component must stay in a stable position in the tree with a
 *  stable identity. If it were remounted, `createWorldMap` would run again and
 *  the player would lose camera and selection every time a panel opened.
 *
 *  Resize is not React's business either, beyond one bridge: see the
 *  `ResizeObserver` effect below for why a grid-track change needs to be
 *  announced to Pixi even though the geometry itself is CSS's job. */
export function MapSurface() {
  const { state, addNotice, setSelection, selection, interaction, cancelOrder, runCommand } = useGame();
  const session = state.session!;
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<WorldMap>();
  const interactionRef = useRef(interaction);
  const snapshotRef = useRef(state.snapshot);
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
    setSelection(picked);
  }, [runCommand, setSelection, cancelOrder, addNotice]);

  // Map is dynamically imported after login so the pixi chunk never loads on the auth screen.
  useEffect(() => {
    if (!state.snapshot || !mapContainer.current) return;
    let cancelled = false;
    void import("../map.js").then(({ createWorldMap }) => {
      if (cancelled) return;
      map.current?.destroy();
      map.current = createWorldMap(mapContainer.current!, state.snapshot!, session.player.id, handleSelect);
      map.current.setInteraction(interactionRef.current);
    });
    return () => { cancelled = true; map.current?.destroy(); map.current = undefined; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token, handleSelect]);

  useEffect(() => { if (state.snapshot) map.current?.update(state.snapshot, selection); }, [state.snapshot, selection]);
  useEffect(() => { map.current?.setInteraction(interaction); }, [interaction]);

  // `map.ts` builds its Application with `resizeTo: container`, and Pixi re-reads
  // that element only when the *window* fires `resize`. Its own ResizeObserver
  // recomputes the world origin, not the renderer's pixel size. Before the
  // Situation Room the map's box only ever changed with the window, so that was
  // enough; now collapsing a column changes a grid track while the window holds
  // still, and the renderer would keep its old size — leaving a dead strip where
  // the map should have grown. Re-broadcasting the container's resize as a window
  // resize closes that gap without touching `map.ts`, and Pixi's `resizeTo`
  // handler is the only `resize` listener in this client, so nothing else moves.
  useEffect(() => {
    const node = mapContainer.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => window.dispatchEvent(new Event("resize")));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return <div ref={mapContainer} className="map" data-testid="world-map">
    <div className="map-toolbar"><button onClick={() => { const city = state.snapshot?.cities.find(item => item.playerId === session.player.id); if (city && map.current) map.current.focusCity(city.x, city.y); }}>Về thành phố của tôi</button></div>
  </div>;
}
