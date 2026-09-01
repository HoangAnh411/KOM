import { Application, Container, Graphics, Text } from "pixi.js";
import type { WorldSnapshot } from "@kingdoms/shared";
import type { InteractionMode } from "./state.js";

const tileWidth = 56;
const tileHeight = 28;
const minZoom = 0.6;
const maxZoom = 1.8;
const mapExtent = 20;
function point(x: number, y: number, originX: number, originY: number): [number, number] { return [originX + (x - y) * tileWidth / 2, originY + (x + y) * tileHeight / 2]; }

export type MapSelection = { kind: "army" | "city"; id: string } | { kind: "tile"; x: number; y: number };
export type WorldMap = {
  update: (next: WorldSnapshot, selection?: MapSelection) => void;
  focusCity: (x: number, y: number) => void;
  setInteraction: (mode: InteractionMode) => void;
  destroy: () => void;
};

// Entity layers hold a Map<entityId, DisplayObject> and patch by id — snapshots
// never tear down a whole layer, only terrain/events (rarely changing) rebuild.
export function createWorldMap(container: HTMLElement, snapshot: WorldSnapshot, ownPlayerId: string, onSelect: (selection: MapSelection | undefined) => void): WorldMap {
  const app = new Application({ resizeTo: container, backgroundColor: 0x0e1b2d, antialias: true });
  const canvas = app.view as HTMLCanvasElement;
  container.appendChild(canvas);
  const terrainLayer = new Container(); app.stage.addChild(terrainLayer);
  const eventLayer = new Container(); app.stage.addChild(eventLayer);
  const resourceLayer = new Container(); app.stage.addChild(resourceLayer);
  const hubLayer = new Container(); app.stage.addChild(hubLayer);
  const cityLayer = new Container(); app.stage.addChild(cityLayer);
  const caravanLayer = new Container(); app.stage.addChild(caravanLayer);
  const armyLayer = new Container(); app.stage.addChild(armyLayer);
  const overlayLayer = new Container(); app.stage.addChild(overlayLayer);
  const originAt = () => ({ x: Math.max(container.clientWidth / 2, 360), y: 50 });
  let latestState = snapshot;
  let selection: MapSelection | undefined;
  let interactionMode: InteractionMode = { kind: "idle" };

  // Pan with pointer drag; zoom with the wheel (0.6x–1.8x, anchored at the cursor).
  let dragging = false;
  let clickStart: [number, number] | undefined;
  let lastPosition: [number, number] | undefined;
  canvas.addEventListener("pointerdown", event => { dragging = true; clickStart = [event.clientX, event.clientY]; lastPosition = [event.clientX, event.clientY]; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener("pointermove", event => {
    if (!dragging || !lastPosition) return;
    layer.position.set(layer.position.x + event.clientX - lastPosition[0], layer.position.y + event.clientY - lastPosition[1]);
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
    const current = layer.scale.x;
    const next = Math.min(maxZoom, Math.max(minZoom, current * factor));
    if (next === current) return;
    const worldX = (event.clientX - layer.position.x) / current;
    const worldY = (event.clientY - layer.position.y) / current;
    layer.scale.set(next);
    layer.position.set(event.clientX - worldX * next, event.clientY - worldY * next);
  }, { passive: false });

  function handleClick(clientX: number, clientY: number): void {
    const rect = canvas.getBoundingClientRect();
    const sx = (clientX - rect.left - layer.position.x) / layer.scale.x;
    const sy = (clientY - rect.top - layer.position.y) / layer.scale.y;
    const origin = originAt();
    let bestArmy: { id: string; distSq: number } | undefined;
    for (const army of latestState.armies) {
      if (army.strength <= 0) continue;
      const [ax, ay] = point(army.x, army.y, origin.x, origin.y);
      const distSq = (ax - sx) ** 2 + (ay - sy) ** 2;
      if (distSq <= 13 ** 2 && (!bestArmy || distSq < bestArmy.distSq)) bestArmy = { id: army.id, distSq };
    }
    let bestCity: { id: string; distSq: number } | undefined;
    for (const city of latestState.cities) {
      const [cx, cy] = point(city.x, city.y, origin.x, origin.y);
      const distSq = (cx - sx) ** 2 + (cy - sy) ** 2;
      if (distSq <= 27 ** 2 && (!bestCity || distSq < bestCity.distSq)) bestCity = { id: city.id, distSq };
    }
    if (bestArmy && (!bestCity || bestArmy.distSq <= bestCity.distSq)) { onSelect({ kind: "army", id: bestArmy.id }); return; }
    if (bestCity) { onSelect({ kind: "city", id: bestCity.id }); return; }
    // Isometric inverse: dx → (x − y) · tileWidth/2, dy → (x + y) · tileHeight/2.
    const dx = sx - origin.x; const dy = sy - origin.y;
    const x = Math.round(((dx * 2) / tileWidth + (dy * 2) / tileHeight) / 2);
    const y = Math.round(((dy * 2) / tileHeight - (dx * 2) / tileWidth) / 2);
    if (x >= 0 && x < mapExtent && y >= 0 && y < mapExtent) onSelect({ kind: "tile", x, y });
    else onSelect(undefined);
  }

  const focusCity = (x: number, y: number) => {
    const origin = originAt();
    const [cx, cy] = point(x, y, origin.x, origin.y);
    layer.position.set(container.clientWidth / 2 - cx * layer.scale.x, container.clientHeight / 2 - cy * layer.scale.y);
  };

  const clearLayer = (target: Container) => { target.removeChildren().forEach(child => child.destroy()); };

  // --- Terrain: rebuilt only when the terrain map itself changes ---
  let terrainSig = "";
  const syncTerrain = (state: WorldSnapshot) => {
    const sig = JSON.stringify(state.terrainMap ?? {});
    if (sig === terrainSig) return;
    terrainSig = sig;
    clearLayer(terrainLayer);
    const origin = originAt(); const originX = origin.x; const originY = origin.y;
    for (let y = 0; y < 20; y += 1) for (let x = 0; x < 20; x += 1) {
      const [cx, cy] = point(x, y, originX, originY); const tile = new Graphics();
      const terrain = state.terrainMap?.[`${x},${y}`] ?? "plains";
      let color = 0x21423f;
      if (terrain === "forest") color = 0x1a3f20;
      else if (terrain === "hills") color = 0x4a3f2a;
      else if (terrain === "swamp") color = 0x2a3540;
      tile.beginFill(color); tile.lineStyle(1, 0x39645b, 0.5); tile.moveTo(cx, cy - tileHeight / 2); tile.lineTo(cx + tileWidth / 2, cy); tile.lineTo(cx, cy + tileHeight / 2); tile.lineTo(cx - tileWidth / 2, cy); tile.closePath(); tile.endFill(); terrainLayer.addChild(tile);
    }
  };

  // --- Events: overlay tints on top of the terrain, rebuilt when the set changes ---
  let eventSig = "";
  const syncEvents = (state: WorldSnapshot) => {
    const events = state.worldEvents ?? [];
    const sig = JSON.stringify(events.map(event => `${event.id}:${event.eventType}:${event.severity}:${JSON.stringify(event.affectedTiles)}`));
    if (sig === eventSig) return;
    eventSig = sig;
    clearLayer(eventLayer);
    const origin = originAt(); const originX = origin.x; const originY = origin.y;
    for (const event of events) {
      const color = event.eventType === "gold_rush" ? 0x736b24 : event.eventType === "plague" ? 0x542d5c : 0x6b3030;
      const border = event.eventType === "gold_rush" ? 0x7dff72 : event.eventType === "plague" ? 0xc26cff : 0xff5c57;
      for (const tile of event.affectedTiles) {
        const [cx, cy] = point(tile.x, tile.y, originX, originY); const overlay = new Graphics();
        overlay.beginFill(color, 0.55); overlay.lineStyle(3, border, 0.95); overlay.moveTo(cx, cy - tileHeight / 2); overlay.lineTo(cx + tileWidth / 2, cy); overlay.lineTo(cx, cy + tileHeight / 2); overlay.lineTo(cx - tileWidth / 2, cy); overlay.closePath(); overlay.endFill(); eventLayer.addChild(overlay);
      }
    }
  };

  // --- Static entity layers: add/remove by id, never a full clear ---
  const drawResourceNode = (target: Graphics, node: { x: number; y: number; resourceType: string }) => {
    const [nx, ny] = point(node.x, node.y, originAt().x, originAt().y);
    target.clear(); target.beginFill(node.resourceType === "iron" ? 0xb8c0d9 : node.resourceType === "stone" ? 0xa9a9a9 : 0x6fbd72); target.drawCircle(nx, ny - 8, 7); target.endFill();
  };
  const resources = new Map<string, Graphics>();
  const syncResources = (state: WorldSnapshot) => {
    const seen = new Set<string>();
    for (const node of state.logistics.resourceNodes) {
      seen.add(node.id);
      let graphic = resources.get(node.id);
      if (!graphic) { graphic = new Graphics(); resources.set(node.id, graphic); resourceLayer.addChild(graphic); }
      drawResourceNode(graphic, node);
    }
    for (const [id, graphic] of resources) if (!seen.has(id)) { resourceLayer.removeChild(graphic); graphic.destroy(); resources.delete(id); }
  };

  const drawHub = (target: Container, hub: { x: number; y: number; name: string }) => {
    target.removeChildren().forEach(child => child.destroy());
    const [hx, hy] = point(hub.x, hub.y, originAt().x, originAt().y);
    const marker = new Graphics();
    marker.beginFill(0xf0d15a); marker.drawRoundedRect(hx - 12, hy - 12, 24, 24, 4); marker.endFill();
    marker.lineStyle(2, 0x8a6d1a); marker.moveTo(hx + 5, hy - 5); marker.lineTo(hx - 5, hy + 5); target.addChild(marker); // anchor cross
    const label = new Text(hub.name, { fontFamily: "Arial", fontSize: 11, fill: 0xffe9a3, stroke: 0x102238, strokeThickness: 3 }); label.anchor.set(0.5); label.position.set(hx, hy + 21); target.addChild(label);
  };
  const hubs = new Map<string, Container>();
  const syncHubs = (state: WorldSnapshot) => {
    const seen = new Set<string>();
    for (const hub of state.logistics.marketHubs) {
      seen.add(hub.id);
      let group = hubs.get(hub.id);
      if (!group) { group = new Container(); hubs.set(hub.id, group); hubLayer.addChild(group); }
      drawHub(group, hub);
    }
    for (const [id, group] of hubs) if (!seen.has(id)) { hubLayer.removeChild(group); group.destroy(); hubs.delete(id); }
  };

  const citySigs = new Map<string, string>();
  const drawCity = (target: Container, city: { x: number; y: number; name: string; frozen?: boolean }) => {
    target.removeChildren().forEach(child => child.destroy());
    const [cx, cy] = point(city.x, city.y, originAt().x, originAt().y);
    const marker = new Graphics();
    if (city.frozen) { marker.beginFill(0x6b3030); marker.drawPolygon([cx, cy - 25, cx + 22, cy - 8, cx + 22, cy + 7, cx, cy + 24, cx - 22, cy + 7, cx - 22, cy - 8]); marker.endFill(); marker.alpha = 0.35; }
    else { marker.beginFill(0x63c5da); marker.drawPolygon([cx, cy - 25, cx + 22, cy - 8, cx + 22, cy + 7, cx, cy + 24, cx - 22, cy + 7, cx - 22, cy - 8]); marker.endFill(); }
    target.addChild(marker);
    const label = new Text(city.name, { fontFamily: "Arial", fontSize: 12, fill: 0xffffff, stroke: 0x102238, strokeThickness: 3 }); label.anchor.set(0.5); label.position.set(cx, cy - 42); target.addChild(label);
    if (city.frozen) { const lock = new Text("KHÓA", { fontFamily: "Arial", fontSize: 9, fontWeight: "bold", fill: 0xff7676, stroke: 0x101010, strokeThickness: 3 }); lock.anchor.set(0.5); lock.position.set(cx, cy + 32); target.addChild(lock); }
  };
  const cities = new Map<string, Container>();
  const syncCities = (state: WorldSnapshot) => {
    const seen = new Set<string>();
    for (const city of state.cities) {
      seen.add(city.id);
      let group = cities.get(city.id);
      if (!group) { group = new Container(); cities.set(city.id, group); cityLayer.addChild(group); }
      const sig = `${city.x},${city.y}|${city.name}|${city.frozen ? 1 : 0}|${city.playerId === ownPlayerId ? "own" : "other"}`;
      if (citySigs.get(city.id) !== sig) { citySigs.set(city.id, sig); drawCity(group, city); }
    }
    for (const [id, group] of cities) if (!seen.has(id)) { cityLayer.removeChild(group); group.destroy(); cities.delete(id); citySigs.delete(id); }
  };

  const caravanSigs = new Map<string, string>();
  const drawCaravan = (target: Graphics, state: WorldSnapshot, caravan: WorldSnapshot["caravans"][number]) => {
    const from = state.cities.find(city => city.id === caravan.sourceCityId);
    const to = caravan.destinationCityId ? state.cities.find(city => city.id === caravan.destinationCityId) : state.logistics.marketHubs.find(hub => hub.id === caravan.destinationMarketId);
    if (!from || !to) { target.clear(); return; }
    const [fx, fy] = point(from.x, from.y, originAt().x, originAt().y); const [tx, ty] = point(to.x, to.y, originAt().x, originAt().y);
    target.clear(); target.beginFill(0xf0d15a); target.drawCircle(fx + (tx - fx) * caravan.progress, fy + (ty - fy) * caravan.progress, 8); target.endFill();
    if (caravan.frozen) { target.alpha = 0.35; target.lineStyle(2, 0xff7676); } else { target.alpha = 1; target.lineStyle(0); }
  };
  const caravans = new Map<string, Graphics>();
  const syncCaravans = (state: WorldSnapshot) => {
    const moving = state.caravans.filter(item => item.status === "moving");
    const seen = new Set<string>();
    for (const caravan of moving) {
      seen.add(caravan.id);
      let graphic = caravans.get(caravan.id);
      if (!graphic) { graphic = new Graphics(); caravans.set(caravan.id, graphic); caravanLayer.addChild(graphic); }
      const sig = `${caravan.progress}|${caravan.frozen ? 1 : 0}|${caravan.destinationCityId ?? caravan.destinationMarketId ?? ""}`;
      if (caravanSigs.get(caravan.id) !== sig) { caravanSigs.set(caravan.id, sig); drawCaravan(graphic, state, caravan); }
    }
    for (const [id, graphic] of caravans) if (!seen.has(id)) { caravanLayer.removeChild(graphic); graphic.destroy(); caravans.delete(id); caravanSigs.delete(id); }
  };

  const armySigs = new Map<string, string>();
  const drawArmy = (target: Container, army: WorldSnapshot["armies"][number]) => {
    target.removeChildren().forEach(child => child.destroy());
    const [cx, cy] = point(army.x, army.y, originAt().x, originAt().y);
    const unit = new Graphics();
    if (army.ownerType === "npc") {
      unit.beginFill(army.npcKind === "migration" ? 0xd8963f : 0xd85656);
      if (army.npcKind === "migration") unit.drawPolygon([cx, cy - 19, cx + 13, cy + 4, cx - 13, cy + 4]);
      else unit.drawPolygon([cx, cy + 16, cx + 13, cy - 4, cx - 13, cy - 4]);
      unit.endFill();
      unit.lineStyle(1, army.npcKind === "migration" ? 0xffc37d : 0xff8a8a);
      unit.moveTo(cx, cy); unit.lineTo(cx, cy + 12);
    } else {
      unit.beginFill(army.unitType === "archer" ? 0x91d36b : army.unitType === "cavalry" ? 0xe58c9d : 0x8fb4e8);
      unit.drawCircle(cx, cy - 8, 8);
      unit.endFill();
      unit.lineStyle(2, army.ownerPlayerId === ownPlayerId ? 0x63c5da : 0xe8ad67);
      unit.moveTo(cx, cy); unit.lineTo(cx, cy + 12);
    }
    target.addChild(unit);
    const label = new Text(army.strength.toString(), { fontFamily: "Arial", fontSize: 10, fill: 0xffffff, stroke: 0x000000, strokeThickness: 2 });
    label.anchor.set(0.5); label.position.set(cx, cy - 24);
    target.addChild(label);
    if (army.frozen) {
      unit.alpha = 0.35;
      const lock = new Text("KHÓA", { fontFamily: "Arial", fontSize: 8, fill: 0xff7676, stroke: 0x000000, strokeThickness: 2 }); lock.anchor.set(0.5); lock.position.set(cx, cy + 24); target.addChild(lock);
    }
  };
  const armies = new Map<string, Container>();
  const syncArmies = (state: WorldSnapshot) => {
    const seen = new Set<string>();
    for (const army of state.armies) {
      if (army.strength <= 0) continue;
      seen.add(army.id);
      let group = armies.get(army.id);
      if (!group) { group = new Container(); armies.set(army.id, group); armyLayer.addChild(group); }
      const sig = `${army.x},${army.y}|${army.strength}|${army.frozen ? 1 : 0}|${army.morale}|${army.npcKind ?? ""}|${army.unitType}|${army.ownerPlayerId === ownPlayerId ? "own" : "other"}`;
      if (armySigs.get(army.id) !== sig) { armySigs.set(army.id, sig); drawArmy(group, army); }
    }
    for (const [id, group] of armies) if (!seen.has(id)) { armyLayer.removeChild(group); group.destroy(); armies.delete(id); armySigs.delete(id); }
  };

  // --- Overlay: selection ring + attack/move order lines, keyed by army id ---
  const overlaySigs = new Map<string, string>();
  const drawOverlay = (target: Container, state: WorldSnapshot, armyId: string) => {
    target.removeChildren().forEach(child => child.destroy());
    const army = state.armies.find(item => item.id === armyId);
    if (!army || army.strength <= 0) { overlaySigs.delete(armyId); return; }
    const [cx, cy] = point(army.x, army.y, originAt().x, originAt().y);
    if (selection?.kind === "army" && selection.id === armyId) {
      const ring = new Graphics();
      ring.lineStyle(2, 0x63ff7d, 0.95);
      ring.drawCircle(cx, army.ownerType === "npc" ? cy : cy - 8, 12);
      target.addChild(ring);
    }
    if (army.attackOrder && !army.frozen) {
      const [tx, ty] = point(army.attackOrder.targetX, army.attackOrder.targetY, originAt().x, originAt().y);
      const line = new Graphics();
      line.lineStyle(2, 0xff4d4d, 0.65);
      line.moveTo(cx, cy + 12); line.lineTo(tx, ty);
      line.lineStyle(1, 0xff4d4d, 0.9);
      line.moveTo(tx - 5, ty - 5); line.lineTo(tx + 5, ty + 5);
      line.moveTo(tx + 5, ty - 5); line.lineTo(tx - 5, ty + 5);
      target.addChild(line);
    } else if (army.targetX !== undefined && army.targetY !== undefined && !army.frozen) {
      const [tx, ty] = point(army.targetX, army.targetY, originAt().x, originAt().y);
      const line = new Graphics();
      line.lineStyle(1, 0xffffff, 0.5);
      line.moveTo(cx, cy + 12); line.lineTo(tx, ty);
      target.addChild(line);
    }
  };
  const overlays = new Map<string, Container>();
  const syncOverlay = (state: WorldSnapshot, armyIds: string[]) => {
    const seen = new Set<string>();
    // Always refresh the selected army's ring and every ordered army's line.
    const needs = new Set([...armyIds]);
    if (selection?.kind === "army") needs.add(selection.id);
    for (const armyId of needs) {
      seen.add(armyId);
      let group = overlays.get(armyId);
      if (!group) { group = new Container(); overlays.set(armyId, group); overlayLayer.addChild(group); }
      drawOverlay(group, state, armyId);
    }
    for (const [id, group] of overlays) if (!seen.has(id)) { overlayLayer.removeChild(group); group.destroy(); overlays.delete(id); }
  };

  const update = (next: WorldSnapshot, nextSelection?: MapSelection) => {
    selection = nextSelection;
    latestState = next;
    syncTerrain(next);
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

  // Persistent layer transform shared by all layers: pan/zoom preserved across snapshots.
  const layer = new Container(); app.stage.addChild(layer);
  for (const child of [terrainLayer, eventLayer, resourceLayer, hubLayer, cityLayer, caravanLayer, armyLayer, overlayLayer]) layer.addChild(child);

  update(snapshot);
  const ownCity = snapshot.cities.find(city => city.playerId === ownPlayerId);
  if (ownCity) focusCity(ownCity.x, ownCity.y);
  let destroyed = false;
  return {
    update: (next, nextSelection) => { if (destroyed) return; update(next, nextSelection); },
    focusCity,
    setInteraction: (mode) => { if (!destroyed) setInteraction(mode); },
    destroy: () => { if (destroyed) return; destroyed = true; app.destroy(true, { children: true }); },
  };
}