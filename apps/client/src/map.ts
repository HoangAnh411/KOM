import * as PIXI from "pixi.js";
import type { WorldSnapshot } from "@kingdoms/shared";

const tileWidth = 56;
const tileHeight = 28;
const minZoom = 0.6;
const maxZoom = 1.8;
const mapExtent = 20;
function point(x: number, y: number, originX: number, originY: number): [number, number] { return [originX + (x - y) * tileWidth / 2, originY + (x + y) * tileHeight / 2]; }

export type MapSelection = { kind: "army" | "city"; id: string } | { kind: "tile"; x: number; y: number };
/** Shared with the React layer: a click resolves according to the current mode
 * (idle selects, move/attack target the commander army at the picked spot). */
export type MapInteraction = { commanderArmyId?: string; mode: "idle" | "move" | "attack"; selectedArmyId?: string };
export type WorldMap = { update: (next: WorldSnapshot) => void; focusCity: (x: number, y: number) => void; destroy: () => void };

export function createWorldMap(container: HTMLElement, snapshot: WorldSnapshot, ownPlayerId: string, interaction: MapInteraction, onSelect: (selection: MapSelection | undefined) => void): WorldMap {
  const app = new PIXI.Application({ resizeTo: container, backgroundColor: 0x0e1b2d, antialias: true });
  const canvas = app.view as HTMLCanvasElement;
  container.appendChild(canvas);
  const layer = new PIXI.Container(); app.stage.addChild(layer);
  const originAt = () => ({ x: Math.max(container.clientWidth / 2, 360), y: 50 });
  let latestState = snapshot;

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

  const draw = (state: WorldSnapshot) => {
    layer.removeChildren().forEach((child) => child.destroy());
    const origin = originAt(); const originX = origin.x; const originY = origin.y;
    for (let y = 0; y < 20; y += 1) for (let x = 0; x < 20; x += 1) {
      const [cx, cy] = point(x, y, originX, originY); const tile = new PIXI.Graphics();
      const terrain = state.terrainMap?.[`${x},${y}`] ?? "plains";
      const event = state.worldEvents?.find(item => item.affectedTiles.some(tile => tile.x === x && tile.y === y));
      let color = 0x21423f;
      if (terrain === "forest") color = 0x1a3f20;
      else if (terrain === "hills") color = 0x4a3f2a;
      else if (terrain === "swamp") color = 0x2a3540;
      if (event) color = event.eventType === "gold_rush" ? 0x736b24 : event.eventType === "plague" ? 0x542d5c : 0x6b3030;
      const eventBorder = event?.eventType === "gold_rush" ? 0x7dff72 : event?.eventType === "plague" ? 0xc26cff : event ? 0xff5c57 : 0x39645b;
      tile.beginFill(color); tile.lineStyle(event ? 3 : 1, eventBorder, event ? 0.95 : 0.5); tile.moveTo(cx, cy - tileHeight / 2); tile.lineTo(cx + tileWidth / 2, cy); tile.lineTo(cx, cy + tileHeight / 2); tile.lineTo(cx - tileWidth / 2, cy); tile.closePath(); tile.endFill(); layer.addChild(tile);
    }
    for (const node of state.logistics.resourceNodes) { const [nx, ny] = point(node.x, node.y, originX, originY); const resource = new PIXI.Graphics(); resource.beginFill(node.resourceType === "iron" ? 0xb8c0d9 : node.resourceType === "stone" ? 0xa9a9a9 : 0x6fbd72); resource.drawCircle(nx, ny - 8, 7); resource.endFill(); layer.addChild(resource); }
    for (const hub of state.logistics.marketHubs) {
      const [hx, hy] = point(hub.x, hub.y, originX, originY); const marker = new PIXI.Graphics();
      marker.beginFill(0xf0d15a); marker.drawRoundedRect(hx - 12, hy - 12, 24, 24, 4); marker.endFill();
      marker.lineStyle(2, 0x8a6d1a); marker.moveTo(hx + 5, hy - 5); marker.lineTo(hx - 5, hy + 5); layer.addChild(marker); // anchor cross
      const label = new PIXI.Text(hub.name, { fontFamily: "Arial", fontSize: 11, fill: 0xffe9a3, stroke: 0x102238, strokeThickness: 3 }); label.anchor.set(0.5); label.position.set(hx, hy + 21); layer.addChild(label);
    }
    for (const city of state.cities) {
      const [cx, cy] = point(city.x, city.y, originX, originY); const marker = new PIXI.Graphics(); marker.beginFill(city.playerId === ownPlayerId ? 0x63c5da : 0xe8ad67); marker.drawPolygon([cx, cy - 25, cx + 22, cy - 8, cx + 22, cy + 7, cx, cy + 24, cx - 22, cy + 7, cx - 22, cy - 8]); marker.endFill();
      const label = new PIXI.Text(city.name, { fontFamily: "Arial", fontSize: 12, fill: 0xffffff, stroke: 0x102238, strokeThickness: 3 }); label.anchor.set(0.5); label.position.set(cx, cy - 42); layer.addChild(marker, label);
      if (city.frozen) { marker.alpha = 0.35; const lock = new PIXI.Text("KHÓA", { fontFamily: "Arial", fontSize: 9, fontWeight: "bold", fill: 0xff7676, stroke: 0x101010, strokeThickness: 3 }); lock.anchor.set(0.5); lock.position.set(cx, cy + 32); layer.addChild(lock); }
    }
    for (const caravan of state.caravans.filter((item) => item.status === "moving")) {
      const from = state.cities.find((city) => city.id === caravan.sourceCityId);
      const to = caravan.destinationCityId
        ? state.cities.find((city) => city.id === caravan.destinationCityId)
        : state.logistics.marketHubs.find((hub) => hub.id === caravan.destinationMarketId);
      if (!from || !to) continue;
      const [fx, fy] = point(from.x, from.y, originX, originY); const [tx, ty] = point(to.x, to.y, originX, originY); const caravanGraphic = new PIXI.Graphics(); caravanGraphic.beginFill(0xf0d15a); caravanGraphic.drawCircle(fx + (tx - fx) * caravan.progress, fy + (ty - fy) * caravan.progress, 8); caravanGraphic.endFill(); layer.addChild(caravanGraphic);
      if (caravan.frozen) { caravanGraphic.alpha = 0.35; caravanGraphic.lineStyle(2, 0xff7676); }
    }
    for (const army of state.armies) {
      if (army.strength <= 0) continue;
      const [cx, cy] = point(army.x, army.y, originX, originY);
      const unit = new PIXI.Graphics();
      // Players: colored circles; raiders: red diamond; migrations: orange triangle.
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
      const label = new PIXI.Text(army.strength.toString(), { fontFamily: "Arial", fontSize: 10, fill: 0xffffff, stroke: 0x000000, strokeThickness: 2 });
      label.anchor.set(0.5); label.position.set(cx, cy - 24);
      layer.addChild(unit, label);
      if (interaction.selectedArmyId === army.id) {
        const ring = new PIXI.Graphics();
        ring.lineStyle(2, 0x63ff7d, 0.95);
        ring.drawCircle(cx, army.ownerType === "npc" ? cy : cy - 8, 12);
        layer.addChild(ring);
      }
      if (army.frozen) {
        unit.alpha = 0.35;
        const lock = new PIXI.Text("KHÓA", { fontFamily: "Arial", fontSize: 8, fill: 0xff7676, stroke: 0x000000, strokeThickness: 2 }); lock.anchor.set(0.5); lock.position.set(cx, cy + 24); layer.addChild(lock);
      }
      // Pursuit order draws a red line to the chase target.
      if (army.attackOrder && !army.frozen) {
        const [tx, ty] = point(army.attackOrder.targetX, army.attackOrder.targetY, originX, originY);
        const line = new PIXI.Graphics();
        line.lineStyle(2, 0xff4d4d, 0.65);
        line.moveTo(cx, cy + 12); line.lineTo(tx, ty);
        line.lineStyle(1, 0xff4d4d, 0.9);
        line.moveTo(tx - 5, ty - 5); line.lineTo(tx + 5, ty + 5);
        line.moveTo(tx + 5, ty - 5); line.lineTo(tx - 5, ty + 5);
        layer.addChild(line);
      }
      // Movement order draws a faint white line.
      if (army.targetX !== undefined && army.targetY !== undefined && !army.attackOrder) {
        const [tx, ty] = point(army.targetX, army.targetY, originX, originY);
        const line = new PIXI.Graphics();
        line.lineStyle(1, 0xffffff, 0.5);
        line.moveTo(cx, cy + 12); line.lineTo(tx, ty);
        layer.addChild(line);
      }
    }
    for (const hero of state.heroes) {
      const [cx, cy] = point(hero.x, hero.y, originX, originY); const portrait = new PIXI.Graphics(); portrait.beginFill(hero.ownerPlayerId === ownPlayerId ? 0xd9a6ff : 0xffa6c1); portrait.drawCircle(cx, cy - 12, 6); portrait.endFill(); portrait.lineStyle(2, 0x2c1940); portrait.drawCircle(cx, cy - 12, 8); layer.addChild(portrait);
    }
  };
  draw(snapshot);
  const ownCity = snapshot.cities.find(city => city.playerId === ownPlayerId);
  if (ownCity) focusCity(ownCity.x, ownCity.y);
  let destroyed = false;
  return {
    update: next => { if (destroyed) return; latestState = next; draw(next); },
    focusCity,
    destroy: () => { if (destroyed) return; destroyed = true; app.destroy(true, { children: true }); },
  };
}