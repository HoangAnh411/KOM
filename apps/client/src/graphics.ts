export type GraphicsQuality = "high" | "balanced" | "low";
const STORAGE_KEY = "meridian-graphics-quality";

export function graphicsQuality(): GraphicsQuality {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "high" || saved === "balanced" || saved === "low") return saved;
    if (window.matchMedia?.("(pointer: coarse)").matches) return "balanced";
  }
  return "high";
}

export function setGraphicsQuality(value: GraphicsQuality): void {
  try { window.localStorage.setItem(STORAGE_KEY, value); } catch { /* private browsing can disable storage */ }
}

export function graphicsDpr(value = graphicsQuality()): number {
  const limit = value === "high" ? 2 : value === "balanced" ? 1.5 : 1;
  return Math.min(window.devicePixelRatio || 1, limit);
}
