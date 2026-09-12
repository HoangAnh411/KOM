import { maxZoom, minZoom, originAt, worldPoint } from "./map-geometry.js";
import type { MapViewState } from "./map-contract.js";

export type Viewport = { width: number; height: number };
export type ScreenPoint = { x: number; y: number };

export function initialMapView(viewport: Viewport, focus?: { x: number; y: number }, zoom = 1): MapViewState {
  const view = { offsetX: 0, offsetY: 0, zoom: clampMapZoom(zoom) };
  return focus ? focusMapView(view, viewport, focus.x, focus.y) : view;
}

export function clampMapZoom(zoom: number): number {
  return Math.min(maxZoom, Math.max(minZoom, zoom));
}

export function focusMapView(view: MapViewState, viewport: Viewport, x: number, y: number): MapViewState {
  const origin = originAt(viewport.width);
  const [wx, wy] = worldPoint(x, y);
  return { ...view, offsetX: viewport.width / 2 - (wx + origin.x) * view.zoom, offsetY: viewport.height / 2 - (wy + origin.y) * view.zoom };
}

export function panMapView(view: MapViewState, dx: number, dy: number): MapViewState {
  return { ...view, offsetX: view.offsetX + dx, offsetY: view.offsetY + dy };
}

export function zoomMapViewAt(view: MapViewState, point: ScreenPoint, requestedZoom: number): MapViewState {
  const zoom = clampMapZoom(requestedZoom);
  if (zoom === view.zoom) return view;
  const localX = (point.x - view.offsetX) / view.zoom;
  const localY = (point.y - view.offsetY) / view.zoom;
  return { zoom, offsetX: point.x - localX * zoom, offsetY: point.y - localY * zoom };
}

export function resizeMapView(view: MapViewState, previous: Viewport, next: Viewport): MapViewState {
  const before = originAt(previous.width);
  const after = originAt(next.width);
  return { ...view, offsetX: view.offsetX - (after.x - before.x) * view.zoom, offsetY: view.offsetY - (after.y - before.y) * view.zoom };
}

export function clientToMap(point: ScreenPoint, rect: { left: number; top: number }, view: MapViewState): ScreenPoint {
  return { x: (point.x - rect.left - view.offsetX) / view.zoom, y: (point.y - rect.top - view.offsetY) / view.zoom };
}
