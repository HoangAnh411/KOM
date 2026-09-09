import type { EquippedCosmetics, WorldSnapshot } from "@kingdoms/shared";
import type { InteractionMode } from "./state.js";
import type { MapSelection, WorldMap } from "./map-contract.js";
import { mapExtent } from "./map-geometry.js";

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

function createWorldListFallback(
  container: HTMLElement,
  initialSnapshot: WorldSnapshot,
  onSelect: (selection: MapSelection | undefined) => void,
): WorldMap {
  const surface = document.createElement("div");
  surface.dataset.worldRenderer = "list";
  surface.className = "world-list-fallback";
  surface.setAttribute("role", "region");
  surface.setAttribute("aria-label", "Bản đồ thế giới dạng danh sách");
  container.prepend(surface);
  let snapshot = initialSnapshot;
  let selection: MapSelection | undefined;
  const render = () => {
    surface.replaceChildren();
    for (const city of snapshot.cities) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "kom-btn kom-btn--ghost";
      button.textContent = `${city.name} — ${city.x}, ${city.y}`;
      button.setAttribute("aria-pressed", String(selection?.kind === "city" && selection.id === city.id));
      button.addEventListener("click", () => onSelect({ kind: "city", id: city.id }));
      surface.append(button);
    }
  };
  render();
  return {
    update(next, nextSelection) { snapshot = next; selection = nextSelection; render(); },
    focusCity(x, y) {
      const city = snapshot.cities.find(item => item.x === Math.round(x) && item.y === Math.round(y));
      if (city) surface.querySelectorAll<HTMLButtonElement>("button")[snapshot.cities.indexOf(city)]?.focus();
    },
    setInteraction() { /* Selection buttons issue the active command through MapSurface. */ },
    setActive(active) { surface.hidden = !active; },
    destroy() { surface.remove(); },
  };
}

/**
 * Dependency-free world renderer used when the Three.js module or WebGL cannot
 * start. It deliberately implements the same contract as the 3D map so the HUD,
 * selection, command targeting and camera controls remain usable.
 */
export function createWorld2DMap(
  container: HTMLElement,
  initialSnapshot: WorldSnapshot,
  ownPlayerId: string,
  onSelect: (selection: MapSelection | undefined) => void,
): WorldMap {
  const canvas = document.createElement("canvas");
  canvas.dataset.worldRenderer = "2d";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.touchAction = "none";
  container.prepend(canvas);
  const context = canvas.getContext("2d");
  if (!context) {
    canvas.remove();
    return createWorldListFallback(container, initialSnapshot, onSelect);
  }

  let snapshot = initialSnapshot;
  let selection: MapSelection | undefined;
  let interaction: InteractionMode = { kind: "idle" };
  let active = true;
  let destroyed = false;
  let width = 1;
  let height = 1;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;

  const worldToScreen = (x: number, y: number) => ({ x: offsetX + (x + .5) * scale, y: offsetY + (y + .5) * scale });
  const screenToWorld = (x: number, y: number) => ({
    x: clamp(Math.floor((x - offsetX) / scale), 0, mapExtent - 1),
    y: clamp(Math.floor((y - offsetY) / scale), 0, mapExtent - 1),
  });

  const draw = () => {
    if (destroyed || !active) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.scale(devicePixelRatio || 1, devicePixelRatio || 1);
    context.fillStyle = "#294b43";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#66866d";
    context.fillRect(offsetX, offsetY, mapExtent * scale, mapExtent * scale);
    context.strokeStyle = "rgba(255,255,255,.12)";
    context.lineWidth = 1;
    const gridStep = scale >= 9 ? 1 : scale >= 4 ? 4 : 16;
    for (let tile = 0; tile <= mapExtent; tile += gridStep) {
      const position = tile * scale;
      context.beginPath(); context.moveTo(offsetX + position, offsetY); context.lineTo(offsetX + position, offsetY + mapExtent * scale); context.stroke();
      context.beginPath(); context.moveTo(offsetX, offsetY + position); context.lineTo(offsetX + mapExtent * scale, offsetY + position); context.stroke();
    }

    for (const city of snapshot.cities) {
      const point = worldToScreen(city.x, city.y);
      context.fillStyle = city.playerId === ownPlayerId ? "#55d1d0" : "#e17b58";
      context.fillRect(point.x - 5, point.y - 5, 10, 10);
    }
    for (const army of snapshot.armies) {
      if (army.strength <= 0) continue;
      const point = worldToScreen(army.x, army.y);
      context.beginPath();
      context.arc(point.x, point.y, 4, 0, Math.PI * 2);
      context.fillStyle = army.ownerPlayerId === ownPlayerId ? "#f2d078" : "#bd5749";
      context.fill();
    }
    const currentSelection = selection;
    if (currentSelection) {
      const entity = currentSelection.kind === "tile" ? currentSelection
        : currentSelection.kind === "city" ? snapshot.cities.find(item => item.id === currentSelection.id)
        : snapshot.armies.find(item => item.id === currentSelection.id);
      if (entity) {
        const point = worldToScreen(entity.x, entity.y);
        context.beginPath(); context.arc(point.x, point.y, 9, 0, Math.PI * 2);
        context.strokeStyle = "#fff5d6"; context.lineWidth = 2; context.stroke();
      }
    }
  };

  const focusCity = (x: number, y: number) => {
    offsetX = width / 2 - (x + .5) * scale;
    offsetY = height / 2 - (y + .5) * scale;
    draw();
  };

  const resize = () => {
    const nextWidth = Math.max(container.clientWidth, 1);
    const nextHeight = Math.max(container.clientHeight, 1);
    const first = width === 1 && height === 1;
    const centre = first ? { x: mapExtent / 2, y: mapExtent / 2 } : screenToWorld(width / 2, height / 2);
    width = nextWidth;
    height = nextHeight;
    const ratio = Math.max(1, devicePixelRatio || 1);
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    scale = Math.max(2, Math.min(20, first ? Math.min(width, height) / mapExtent : scale));
    focusCity(centre.x, centre.y);
  };

  const pick = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const nearest = <T extends { id: string; x: number; y: number }>(items: readonly T[], radius: number): T | undefined => {
      let best: { item: T; distance: number } | undefined;
      for (const item of items) {
        const point = worldToScreen(item.x, item.y);
        const distance = Math.hypot(point.x - x, point.y - y);
        if (distance <= radius && (!best || distance < best.distance)) best = { item, distance };
      }
      return best?.item;
    };
    if (interaction.kind !== "move") {
      const army = nearest(snapshot.armies.filter(item => item.strength > 0), 12);
      if (army) return onSelect({ kind: "army", id: army.id });
      const city = nearest(snapshot.cities, 14);
      if (city) return onSelect({ kind: "city", id: city.id });
    }
    onSelect({ kind: "tile", ...screenToWorld(x, y) });
  };

  const onPointerDown = (event: PointerEvent) => {
    dragging = true; moved = false; startX = lastX = event.clientX; startY = lastY = event.clientY;
    try { canvas.setPointerCapture(event.pointerId); } catch { /* Synthetic events have no capture. */ }
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    moved ||= Math.hypot(event.clientX - startX, event.clientY - startY) >= 4;
    if (moved) { offsetX += event.clientX - lastX; offsetY += event.clientY - lastY; draw(); }
    lastX = event.clientX; lastY = event.clientY;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    if (!moved && event.type !== "pointercancel") pick(event.clientX, event.clientY);
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const point = screenToWorld(x, y);
    scale = clamp(scale * Math.exp(-event.deltaY * .0012), 2, 24);
    offsetX = x - (point.x + .5) * scale;
    offsetY = y - (point.y + .5) * scale;
    draw();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  const ownCity = snapshot.cities.find(city => city.playerId === ownPlayerId);
  if (ownCity) focusCity(ownCity.x, ownCity.y);

  return {
    update(next, nextSelection, _equipped?: EquippedCosmetics) { snapshot = next; selection = nextSelection; draw(); },
    focusCity,
    setInteraction(next) { interaction = next; canvas.style.cursor = next.kind === "idle" ? "grab" : "crosshair"; },
    setActive(next) { active = next; if (active) draw(); },
    destroy() {
      destroyed = true;
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.remove();
    },
  };
}
