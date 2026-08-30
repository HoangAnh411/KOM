import * as PIXI from "pixi.js";
import type { WorldSnapshot } from "@kingdoms/shared";

const tileWidth = 56;
const tileHeight = 28;
function point(x: number, y: number, originX: number, originY: number): [number, number] { return [originX + (x - y) * tileWidth / 2, originY + (x + y) * tileHeight / 2]; }

export function createWorldMap(container: HTMLElement, snapshot: WorldSnapshot, ownPlayerId: string): { update: (next: WorldSnapshot) => void; destroy: () => void } {
  const app = new PIXI.Application({ resizeTo: container, backgroundColor: 0x0e1b2d, antialias: true });
  container.appendChild(app.view as HTMLCanvasElement);
  const layer = new PIXI.Container(); app.stage.addChild(layer);
  const draw = (state: WorldSnapshot) => {
    layer.removeChildren().forEach((child) => child.destroy());
    const originX = Math.max(container.clientWidth / 2, 360); const originY = 50;
    for (let y = 0; y < 20; y += 1) for (let x = 0; x < 20; x += 1) {
      const [cx, cy] = point(x, y, originX, originY); const tile = new PIXI.Graphics();
      const terrain = state.terrainMap?.[`${x},${y}`] ?? "plains";
      let color = 0x21423f;
      if (terrain === "forest") color = 0x1a3f20;
      else if (terrain === "hills") color = 0x4a3f2a;
      else if (terrain === "swamp") color = 0x2a3540;
      tile.beginFill(color); tile.lineStyle(1, 0x39645b, 0.5); tile.moveTo(cx, cy - tileHeight / 2); tile.lineTo(cx + tileWidth / 2, cy); tile.lineTo(cx, cy + tileHeight / 2); tile.lineTo(cx - tileWidth / 2, cy); tile.closePath(); tile.endFill(); layer.addChild(tile);
    }
    for (const node of state.logistics.resourceNodes) { const [nx, ny] = point(node.x, node.y, originX, originY); const resource = new PIXI.Graphics(); resource.beginFill(node.resourceType === "iron" ? 0xb8c0d9 : node.resourceType === "stone" ? 0xa9a9a9 : 0x6fbd72); resource.drawCircle(nx, ny - 8, 7); resource.endFill(); layer.addChild(resource); }
    for (const city of state.cities) {
      const [cx, cy] = point(city.x, city.y, originX, originY); const marker = new PIXI.Graphics(); marker.beginFill(city.playerId === ownPlayerId ? 0x63c5da : 0xe8ad67); marker.drawPolygon([cx, cy - 25, cx + 22, cy - 8, cx + 22, cy + 7, cx, cy + 24, cx - 22, cy + 7, cx - 22, cy - 8]); marker.endFill();
      const label = new PIXI.Text(city.name, { fontFamily: "Arial", fontSize: 12, fill: 0xffffff, stroke: 0x102238, strokeThickness: 3 }); label.anchor.set(0.5); label.position.set(cx, cy - 42); layer.addChild(marker, label);
    }
    for (const caravan of state.caravans.filter((item) => item.status === "moving")) {
      const from = state.cities.find((city) => city.id === caravan.sourceCityId); const to = state.cities.find((city) => city.id === caravan.destinationCityId); if (!from || !to) continue;
      const [fx, fy] = point(from.x, from.y, originX, originY); const [tx, ty] = point(to.x, to.y, originX, originY); const caravanGraphic = new PIXI.Graphics(); caravanGraphic.beginFill(0xf0d15a); caravanGraphic.drawCircle(fx + (tx - fx) * caravan.progress, fy + (ty - fy) * caravan.progress, 8); caravanGraphic.endFill(); layer.addChild(caravanGraphic);
    }
    for (const army of state.armies) {
      if (army.strength <= 0) continue;
      const [cx, cy] = point(army.x, army.y, originX, originY); 
      const unit = new PIXI.Graphics(); 
      unit.beginFill(army.unitType === "archer" ? 0x91d36b : army.unitType === "cavalry" ? 0xe58c9d : 0x8fb4e8); 
      unit.drawCircle(cx, cy - 8, 8); 
      unit.endFill(); 
      unit.lineStyle(2, army.ownerPlayerId === ownPlayerId ? 0x63c5da : 0xe8ad67); 
      unit.moveTo(cx, cy); unit.lineTo(cx, cy + 12); 
      const label = new PIXI.Text(army.strength.toString(), { fontFamily: "Arial", fontSize: 10, fill: 0xffffff, stroke: 0x000000, strokeThickness: 2 });
      label.anchor.set(0.5); label.position.set(cx, cy - 22);
      layer.addChild(unit, label);
      if (army.targetX !== undefined && army.targetY !== undefined) {
        const [tx, ty] = point(army.targetX, army.targetY, originX, originY);
        const line = new PIXI.Graphics();
        line.lineStyle(1, 0xffffff, 0.5);
        line.moveTo(cx, cy + 12);
        line.lineTo(tx, ty);
        layer.addChild(line);
      }
    }
    for (const hero of state.heroes) {
      const [cx, cy] = point(hero.x, hero.y, originX, originY); const portrait = new PIXI.Graphics(); portrait.beginFill(hero.ownerPlayerId === ownPlayerId ? 0xd9a6ff : 0xffa6c1); portrait.drawCircle(cx, cy - 12, 6); portrait.endFill(); portrait.lineStyle(2, 0x2c1940); portrait.drawCircle(cx, cy - 12, 8); layer.addChild(portrait);
    }
  };
  draw(snapshot);
  return { update: draw, destroy: () => app.destroy(true, { children: true }) };
}


