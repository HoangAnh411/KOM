import { Application, Container, Graphics, RenderTexture, Sprite } from "pixi.js";
import type { WorldSnapshot } from "@kingdoms/shared";
import type { InteractionMode } from "./state.js";
import {
  armyGeometrySig, cityGeometrySig, eventSig, isoDepth, mapExtent, maxZoom, minZoom,
  originAt, overlayGeometrySig, pickAt, terrainBounds, terrainSig, tileHeight, tileWidth, worldPoint,
} from "./map-geometry.js";
import { createLabel, type MapLabel } from "./map-labels.js";

export type MapSelection = { kind: "army" | "city"; id: string } | { kind: "tile"; x: number; y: number };
export type WorldMap = {
  update: (next: WorldSnapshot, selection?: MapSelection) => void;
  focusCity: (x: number, y: number) => void;
  setInteraction: (mode: InteractionMode) => void;
  destroy: () => void;
};

// Scene graph:
//
//   stage
//   └── camera        pan + zoom
//       └── world     screen origin of grid (0,0)
//           ├── terrainSprite   one RenderTexture-backed Sprite (was 400 Graphics)
//           ├── eventLayer      one Graphics per rebuild
//           ├── resource/hub/city/caravan/army layers   depth-sorted containers
//           └── overlayLayer    selection rings + order lines
//
// All geometry is drawn in WORLD space, so entity movement is a container
// transform and the screen origin is a single `world.position` write. That is
// what keeps terrain and entities aligned when the viewport resizes: nothing is
// re-baked, the whole world moves together.
export function createWorldMap(container: HTMLElement, snapshot: WorldSnapshot, ownPlayerId: string, onSelect: (selection: MapSelection | undefined) => void): WorldMap {
  const app = new Application({ resizeTo: container, backgroundColor: 0x0e1b2d, antialias: true });
  const canvas = app.view as HTMLCanvasElement;
  container.appendChild(canvas);

  const camera = new Container();
  const world = new Container();
  app.stage.addChild(camera);
  camera.addChild(world);
  const eventLayer = new Container();
  const resourceLayer = new Container();
  const hubLayer = new Container();
  const cityLayer = new Container();
  const caravanLayer = new Container();
  const armyLayer = new Container();
  const overlayLayer = new Container();
  // Layer order is unchanged from before the refactor; `sortableChildren` adds
  // isometric depth *within* a layer, so a southern army no longer draws behind
  // a northern one, but armies still never sink below cities.
  for (const layer of [eventLayer, resourceLayer, hubLayer, cityLayer, caravanLayer, armyLayer, overlayLayer]) world.addChild(layer);
  for (const layer of [resourceLayer, hubLayer, cityLayer, caravanLayer, armyLayer]) layer.sortableChildren = true;

  let latestState = snapshot;
  let selection: MapSelection | undefined;
  let interactionMode: InteractionMode = { kind: "idle" };

  // --- Viewport cache -------------------------------------------------------
  // `originAt()` used to be called from inside every draw function, so a single
  // snapshot forced dozens of `clientWidth` reads and with them dozens of
  // synchronous layout flushes. The viewport is now read only when it actually
  // changes, and the origin is applied as one transform.
  let viewportWidth = container.clientWidth;
  let viewportHeight = container.clientHeight;
  let origin = originAt(viewportWidth);
  world.position.set(origin.x, origin.y);

  const applyViewport = (width: number, height: number) => {
    if (width === viewportWidth && height === viewportHeight) return;
    viewportWidth = width;
    viewportHeight = height;
    const next = originAt(width);
    // Compensate the camera by the origin delta so the player keeps looking at
    // the same tiles across a resize instead of having the world jump sideways.
    camera.position.set(camera.position.x - (next.x - origin.x) * camera.scale.x, camera.position.y - (next.y - origin.y) * camera.scale.y);
    origin = next;
    world.position.set(origin.x, origin.y);
  };

  const resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(entries => {
    const entry = entries[entries.length - 1];
    if (entry) applyViewport(entry.contentRect.width, entry.contentRect.height);
  });
  resizeObserver?.observe(container);

  // --- Camera input: unchanged pan/zoom/click behaviour ---------------------
  // Pan with pointer drag; zoom with the wheel (0.6x–1.8x, anchored at the cursor).
  let dragging = false;
  let clickStart: [number, number] | undefined;
  let lastPosition: [number, number] | undefined;
  canvas.addEventListener("pointerdown", event => { dragging = true; clickStart = [event.clientX, event.clientY]; lastPosition = [event.clientX, event.clientY]; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener("pointermove", event => {
    if (!dragging || !lastPosition) return;
    camera.position.set(camera.position.x + event.clientX - lastPosition[0], camera.position.y + event.clientY - lastPosition[1]);
    lastPosition = [event.clientX, event.clientY];
  });
  const stopDrag = (event?: PointerEvent) => {
    // A press that barely moved is a click (select / command), not a pan.
    if (dragging && clickStart && event && (event.clientX - clickStart[0]) ** 2 + (event.clientY - clickStart[1]) ** 2 < 25) {
      handleClick(event.clientX, event.clientY);
    }
    dragging = false; lastPosition = undefined; clickStart = undefined;
  };
  canvas.addEventListener("pointerup", event => stopDrag(event));
  canvas.addEventListener("pointercancel", stopDrag);
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0012);
    const current = camera.scale.x;
    const next = Math.min(maxZoom, Math.max(minZoom, current * factor));
    if (next === current) return;
    const worldX = (event.clientX - camera.position.x) / current;
    const worldY = (event.clientY - camera.position.y) / current;
    camera.scale.set(next);
    camera.position.set(event.clientX - worldX * next, event.clientY - worldY * next);
  }, { passive: false });

  function handleClick(clientX: number, clientY: number): void {
    const rect = canvas.getBoundingClientRect();
    const sx = (clientX - rect.left - camera.position.x) / camera.scale.x;
    const sy = (clientY - rect.top - camera.position.y) / camera.scale.y;
    onSelect(pickAt(sx, sy, origin, latestState.armies, latestState.cities));
  }

  const focusCity = (x: number, y: number) => {
    const [wx, wy] = worldPoint(x, y);
    camera.position.set(viewportWidth / 2 - (wx + origin.x) * camera.scale.x, viewportHeight / 2 - (wy + origin.y) * camera.scale.y);
  };

  const diamond = (target: Graphics, cx: number, cy: number) => {
    target.moveTo(cx, cy - tileHeight / 2);
    target.lineTo(cx + tileWidth / 2, cy);
    target.lineTo(cx, cy + tileHeight / 2);
    target.lineTo(cx - tileWidth / 2, cy);
    target.closePath();
  };

  // --- Terrain: baked once into a single RenderTexture ----------------------
  // The field is 20x20 = 400 diamonds that only change when the server sends a
  // different terrain map — previously 400 live Graphics objects re-tessellated
  // on every rebuild. It is now rasterised into one texture and drawn as one
  // Sprite. The texture covers the whole world (1120x560 world units) at 2x, so
  // it stays crisp at the 1.8x zoom ceiling: 2244x1124 physical pixels, ~10 MB,
  // comfortably inside the 4096 texture limit every WebGL target guarantees.
  const bounds = terrainBounds();
  const terrainPad = 1; // keeps the 1px stroke of the outermost tiles off the texture edge
  const terrainResolution = 2;
  let terrainTexture: RenderTexture | undefined;
  let terrainSprite: Sprite | undefined;
  let bakedTerrain: string | undefined;

  const bakeTerrain = (state: WorldSnapshot) => {
    const sig = terrainSig(state.terrainMap);
    if (sig === bakedTerrain && terrainSprite) return;
    bakedTerrain = sig;
    const field = new Graphics();
    for (let y = 0; y < mapExtent; y += 1) for (let x = 0; x < mapExtent; x += 1) {
      const [wx, wy] = worldPoint(x, y);
      const terrain = state.terrainMap?.[`${x},${y}`] ?? "plains";
      let color = 0x21423f;
      if (terrain === "forest") color = 0x1a3f20;
      else if (terrain === "hills") color = 0x4a3f2a;
      else if (terrain === "swamp") color = 0x2a3540;
      field.beginFill(color);
      field.lineStyle(1, 0x39645b, 0.5);
      diamond(field, wx - bounds.x + terrainPad, wy - bounds.y + terrainPad);
      field.endFill();
    }
    if (!terrainTexture) terrainTexture = RenderTexture.create({ width: bounds.width + terrainPad * 2, height: bounds.height + terrainPad * 2, resolution: terrainResolution });
    app.renderer.render(field, { renderTexture: terrainTexture, clear: true });
    field.destroy();
    if (!terrainSprite) {
      terrainSprite = new Sprite(terrainTexture);
      terrainSprite.position.set(bounds.x - terrainPad, bounds.y - terrainPad);
      world.addChildAt(terrainSprite, 0);
    }
  };

  // --- World events: tinted tiles, one Graphics for the whole set -----------
  let bakedEvents = "";
  const eventField = new Graphics();
  eventLayer.addChild(eventField);
  const syncEvents = (state: WorldSnapshot) => {
    const events = state.worldEvents ?? [];
    const sig = eventSig(events);
    if (sig === bakedEvents) return;
    bakedEvents = sig;
    eventField.clear();
    for (const event of events) {
      const color = event.eventType === "gold_rush" ? 0x736b24 : event.eventType === "plague" ? 0x542d5c : 0x6b3030;
      const border = event.eventType === "gold_rush" ? 0x7dff72 : event.eventType === "plague" ? 0xc26cff : 0xff5c57;
      for (const tile of event.affectedTiles) {
        const [wx, wy] = worldPoint(tile.x, tile.y);
        eventField.beginFill(color, 0.55);
        eventField.lineStyle(3, border, 0.95);
        diamond(eventField, wx, wy);
        eventField.endFill();
      }
    }
  };

  // --- Resource nodes -------------------------------------------------------
  const resources = new Map<string, { root: Graphics; geometry: string }>();
  const syncResources = (state: WorldSnapshot) => {
    const seen = new Set<string>();
    for (const node of state.logistics.resourceNodes) {
      seen.add(node.id);
      let view = resources.get(node.id);
      if (!view) {
        const root = new Graphics();
        root.cullable = true;
        view = { root, geometry: "" };
        resources.set(node.id, view);
        resourceLayer.addChild(root);
      }
      if (view.geometry !== node.resourceType) {
        view.geometry = node.resourceType;
        view.root.clear();
        view.root.beginFill(node.resourceType === "iron" ? 0xb8c0d9 : node.resourceType === "stone" ? 0xa9a9a9 : 0x6fbd72);
        view.root.drawCircle(0, -8, 7);
        view.root.endFill();
      }
      const [wx, wy] = worldPoint(node.x, node.y);
      view.root.position.set(wx, wy);
      view.root.zIndex = isoDepth(node.x, node.y);
    }
    for (const [id, view] of resources) if (!seen.has(id)) { view.root.destroy(); resources.delete(id); }
  };

  /** Adds a label once and reuses it afterwards. Only swaps the backing object
   *  when a name moves in or out of the bitmap atlas' charset. */
  const addLabel = (parent: Container, text: string, fontSize: number, color: number, x: number, y: number): MapLabel => {
    const label = createLabel(text, fontSize, color);
    label.view.position.set(x, y);
    parent.addChild(label.view);
    return label;
  };
  const setLabel = (parent: Container, current: MapLabel, text: string, fontSize: number, color: number, x: number, y: number): MapLabel => {
    if (current.setText(text)) return current;
    current.view.destroy();
    return addLabel(parent, text, fontSize, color, x, y);
  };

  // --- Market hubs ----------------------------------------------------------
  const hubs = new Map<string, { root: Container; label: MapLabel; text: string }>();
  const syncHubs = (state: WorldSnapshot) => {
    const seen = new Set<string>();
    for (const hub of state.logistics.marketHubs) {
      seen.add(hub.id);
      let view = hubs.get(hub.id);
      if (!view) {
        const root = new Container();
        root.cullable = true;
        const marker = new Graphics();
        marker.beginFill(0xf0d15a); marker.drawRoundedRect(-12, -12, 24, 24, 4); marker.endFill();
        marker.lineStyle(2, 0x8a6d1a); marker.moveTo(5, -5); marker.lineTo(-5, 5); // anchor cross
        root.addChild(marker);
        view = { root, label: addLabel(root, hub.name, 11, 0xffe9a3, 0, 21), text: hub.name };
        hubs.set(hub.id, view);
        hubLayer.addChild(root);
      }
      if (view.text !== hub.name) { view.text = hub.name; view.label = setLabel(view.root, view.label, hub.name, 11, 0xffe9a3, 0, 21); }
      const [wx, wy] = worldPoint(hub.x, hub.y);
      view.root.position.set(wx, wy);
      view.root.zIndex = isoDepth(hub.x, hub.y);
    }
    for (const [id, view] of hubs) if (!seen.has(id)) { view.root.destroy({ children: true }); hubs.delete(id); }
  };

  // --- Cities ---------------------------------------------------------------
  const cityHex = [0, -25, 22, -8, 22, 7, 0, 24, -22, 7, -22, -8];
  const cities = new Map<string, { root: Container; body: Graphics; label: MapLabel; lock?: MapLabel; geometry: string; text: string }>();
  const syncCities = (state: WorldSnapshot) => {
    const seen = new Set<string>();
    for (const city of state.cities) {
      seen.add(city.id);
      let view = cities.get(city.id);
      if (!view) {
        const root = new Container();
        root.cullable = true;
        const body = new Graphics();
        root.addChild(body);
        view = { root, body, label: addLabel(root, city.name, 12, 0xffffff, 0, -42), geometry: "", text: city.name };
        cities.set(city.id, view);
        cityLayer.addChild(root);
      }
      const geometry = cityGeometrySig(city, ownPlayerId);
      if (view.geometry !== geometry) {
        view.geometry = geometry;
        view.body.clear();
        view.body.beginFill(city.frozen ? 0x6b3030 : 0x63c5da);
        view.body.drawPolygon(cityHex);
        view.body.endFill();
        view.body.alpha = city.frozen ? 0.35 : 1;
        if (city.frozen && !view.lock) view.lock = addLabel(view.root, "KHÓA", 9, 0xff7676, 0, 32);
        else if (!city.frozen && view.lock) { view.lock.view.destroy(); view.lock = undefined; }
      }
      if (view.text !== city.name) { view.text = city.name; view.label = setLabel(view.root, view.label, city.name, 12, 0xffffff, 0, -42); }
      const [wx, wy] = worldPoint(city.x, city.y);
      view.root.position.set(wx, wy);
      view.root.zIndex = isoDepth(city.x, city.y);
    }
    for (const [id, view] of cities) if (!seen.has(id)) { view.root.destroy({ children: true }); cities.delete(id); }
  };

  // --- Caravans -------------------------------------------------------------
  // Progress changes every tick, so this is the hottest entity on the map. The
  // marker geometry is built once; a tick is now a position write. Grid
  // coordinates are interpolated rather than screen coordinates — the projection
  // is affine, so the drawn point is identical to the old screen-space lerp.
  const caravans = new Map<string, { root: Graphics }>();
  const syncCaravans = (state: WorldSnapshot) => {
    const seen = new Set<string>();
    for (const caravan of state.caravans) {
      if (caravan.status !== "moving") continue;
      seen.add(caravan.id);
      let view = caravans.get(caravan.id);
      if (!view) {
        const root = new Graphics();
        root.cullable = true;
        root.beginFill(0xf0d15a); root.drawCircle(0, 0, 8); root.endFill();
        view = { root };
        caravans.set(caravan.id, view);
        caravanLayer.addChild(root);
      }
      const from = state.cities.find(city => city.id === caravan.sourceCityId);
      const to = caravan.destinationCityId
        ? state.cities.find(city => city.id === caravan.destinationCityId)
        : state.logistics.marketHubs.find(hub => hub.id === caravan.destinationMarketId);
      if (!from || !to) { view.root.visible = false; continue; }
      const gx = from.x + (to.x - from.x) * caravan.progress;
      const gy = from.y + (to.y - from.y) * caravan.progress;
      const [wx, wy] = worldPoint(gx, gy);
      view.root.visible = true;
      view.root.position.set(wx, wy);
      view.root.zIndex = isoDepth(gx, gy);
      view.root.alpha = caravan.frozen ? 0.35 : 1;
    }
    for (const [id, view] of caravans) if (!seen.has(id)) { view.root.destroy(); caravans.delete(id); }
  };

  // --- Armies ---------------------------------------------------------------
  const armies = new Map<string, { root: Container; body: Graphics; label: MapLabel; lock?: MapLabel; geometry: string; text: string }>();
  const syncArmies = (state: WorldSnapshot) => {
    const seen = new Set<string>();
    for (const army of state.armies) {
      if (army.strength <= 0) continue;
      seen.add(army.id);
      const strength = army.strength.toString();
      let view = armies.get(army.id);
      if (!view) {
        const root = new Container();
        root.cullable = true;
        const body = new Graphics();
        root.addChild(body);
        view = { root, body, label: addLabel(root, strength, 10, 0xffffff, 0, -24), geometry: "", text: strength };
        armies.set(army.id, view);
        armyLayer.addChild(root);
      }
      const geometry = armyGeometrySig(army, ownPlayerId);
      if (view.geometry !== geometry) {
        view.geometry = geometry;
        const body = view.body;
        body.clear();
        if (army.ownerType === "npc") {
          body.beginFill(army.npcKind === "migration" ? 0xd8963f : 0xd85656);
          if (army.npcKind === "migration") body.drawPolygon([0, -19, 13, 4, -13, 4]);
          else body.drawPolygon([0, 16, 13, -4, -13, -4]);
          body.endFill();
          body.lineStyle(1, army.npcKind === "migration" ? 0xffc37d : 0xff8a8a);
        } else {
          body.beginFill(army.unitType === "archer" ? 0x91d36b : army.unitType === "cavalry" ? 0xe58c9d : 0x8fb4e8);
          body.drawCircle(0, -8, 8);
          body.endFill();
          body.lineStyle(2, army.ownerPlayerId === ownPlayerId ? 0x63c5da : 0xe8ad67);
        }
        body.moveTo(0, 0); body.lineTo(0, 12);
        body.alpha = army.frozen ? 0.35 : 1;
        if (army.frozen && !view.lock) view.lock = addLabel(view.root, "KHÓA", 8, 0xff7676, 0, 24);
        else if (!army.frozen && view.lock) { view.lock.view.destroy(); view.lock = undefined; }
      }
      if (view.text !== strength) { view.text = strength; view.label = setLabel(view.root, view.label, strength, 10, 0xffffff, 0, -24); }
      const [wx, wy] = worldPoint(army.x, army.y);
      view.root.position.set(wx, wy);
      view.root.zIndex = isoDepth(army.x, army.y);
    }
    for (const [id, view] of armies) if (!seen.has(id)) { view.root.destroy({ children: true }); armies.delete(id); }
  };

  // --- Overlay: selection ring + attack/move order lines --------------------
  // Signature-driven for real now. The previous version recomputed a signature
  // it never compared, so every ring and every order line was destroyed and
  // re-tessellated on each snapshot. Geometry is local to the army, so an army
  // marching toward a fixed target keeps its ring for free and only rebuilds the
  // line because the *relative* vector to the target actually changed.
  const overlays = new Map<string, { root: Graphics; geometry: string }>();
  const syncOverlay = (state: WorldSnapshot, armyIds: string[]) => {
    const needs = new Set(armyIds);
    if (selection?.kind === "army") needs.add(selection.id);
    for (const armyId of needs) {
      let view = overlays.get(armyId);
      if (!view) {
        const root = new Graphics();
        root.cullable = true;
        view = { root, geometry: "" };
        overlays.set(armyId, view);
        overlayLayer.addChild(root);
      }
      const army = state.armies.find(item => item.id === armyId);
      if (!army || army.strength <= 0) {
        if (view.geometry !== "gone") { view.geometry = "gone"; view.root.clear(); }
        view.root.visible = false;
        continue;
      }
      view.root.visible = true;
      const geometry = overlayGeometrySig(army, selection?.kind === "army" && selection.id === armyId);
      if (view.geometry !== geometry) {
        view.geometry = geometry;
        const line = view.root;
        line.clear();
        if (selection?.kind === "army" && selection.id === armyId) {
          line.lineStyle(2, 0x63ff7d, 0.95);
          line.drawCircle(0, army.ownerType === "npc" ? 0 : -8, 12);
        }
        const order = army.attackOrder && !army.frozen
          ? { kind: "attack" as const, x: army.attackOrder.targetX, y: army.attackOrder.targetY }
          : army.targetX !== undefined && army.targetY !== undefined && !army.frozen
            ? { kind: "move" as const, x: army.targetX, y: army.targetY }
            : undefined;
        if (order) {
          const [rx, ry] = worldPoint(order.x - army.x, order.y - army.y);
          if (order.kind === "attack") {
            line.lineStyle(2, 0xff4d4d, 0.65);
            line.moveTo(0, 12); line.lineTo(rx, ry);
            line.lineStyle(1, 0xff4d4d, 0.9);
            line.moveTo(rx - 5, ry - 5); line.lineTo(rx + 5, ry + 5);
            line.moveTo(rx + 5, ry - 5); line.lineTo(rx - 5, ry + 5);
          } else {
            line.lineStyle(1, 0xffffff, 0.5);
            line.moveTo(0, 12); line.lineTo(rx, ry);
          }
        }
      }
      const [wx, wy] = worldPoint(army.x, army.y);
      view.root.position.set(wx, wy);
    }
    for (const [id, view] of overlays) if (!needs.has(id)) { view.root.destroy(); overlays.delete(id); }
  };

  const update = (next: WorldSnapshot, nextSelection?: MapSelection) => {
    selection = nextSelection;
    latestState = next;
    bakeTerrain(next);
    syncEvents(next);
    syncResources(next);
    syncHubs(next);
    syncCities(next);
    syncCaravans(next);
    syncArmies(next);
    const orderedIds = next.armies.filter(army => army.strength > 0 && !army.frozen && (army.attackOrder !== undefined || army.targetX !== undefined)).map(army => army.id);
    syncOverlay(next, orderedIds);
  };
  const setInteraction = (mode: InteractionMode) => { interactionMode = mode; canvas.style.cursor = interactionMode.kind === "idle" ? "" : "crosshair"; };

  update(snapshot);
  const ownCity = snapshot.cities.find(city => city.playerId === ownPlayerId);
  if (ownCity) focusCity(ownCity.x, ownCity.y);
  let destroyed = false;
  return {
    update: (next, nextSelection) => { if (destroyed) return; update(next, nextSelection); },
    focusCity,
    setInteraction: (mode) => { if (!destroyed) setInteraction(mode); },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      resizeObserver?.disconnect();
      // `app.destroy` tears down the stage and the terrain Sprite but leaves the
      // Sprite's texture alone, so the RenderTexture is released explicitly —
      // it is the one large GPU allocation this module owns. The bitmap label
      // atlas is deliberately kept: Pixi caches it globally and the next
      // createWorldMap reuses it instead of rasterising a second copy.
      app.destroy(true, { children: true });
      terrainTexture?.destroy(true);
      terrainTexture = undefined;
      terrainSprite = undefined;
    },
  };
}
