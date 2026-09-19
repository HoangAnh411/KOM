// The hub's view-model: everything the redesigned PlayerHubModal renders is
// derived here so the layout decisions — which glyph, how full a meter, which
// preview class — are testable on the bare node runner, and the component
// itself stays a thin render. Scores are 0–1000 by contract (scoreSchema), so
// every meter shares the same denominator.

import type { ClaimableCosmeticReward, CosmeticSlot, Scores } from "@kingdoms/shared";
import type { IconName } from "../ui/tokens.js";

export const SCORE_MAX = 1000;

export type ScoreMeter = { key: keyof Scores; icon: IconName; label: string; value: number; fraction: number };

const scoreMeta: Record<keyof Scores, { icon: IconName; label: string; order: number }> = {
  military: { icon: "sword", label: "Quân sự", order: 1 },
  economy: { icon: "coin", label: "Kinh tế", order: 2 },
  diplomacy: { icon: "treaty", label: "Ngoại giao", order: 3 },
  overall: { icon: "star", label: "Tổng", order: 0 },
};

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

export function scoreMeters(scores: Scores): ScoreMeter[] {
  return (Object.keys(scoreMeta) as Array<keyof Scores>)
    .sort((a, b) => scoreMeta[a].order - scoreMeta[b].order)
    .map(key => ({ key, icon: scoreMeta[key].icon, label: scoreMeta[key].label, value: scores[key], fraction: clamp01(scores[key] / SCORE_MAX) }));
}

/** Cross-season reputation has no published cap, so the meter reads as "progress
 *  through the rank ladder" rather than a hard total: each 250 reputation is a
 *  full bar, and the integer part feeds the rank number beside it. */
export const REPUTATION_RANK_STEP = 250;

export function reputationMeter(reputation: number): { rank: number; fraction: number } {
  return { rank: Math.floor(reputation / REPUTATION_RANK_STEP) + 1, fraction: clamp01((reputation % REPUTATION_RANK_STEP) / REPUTATION_RANK_STEP) };
}

/** Rewards carry no progress telemetry — only the eligible/claimed flags — so
 *  the bar is a three-state signal: empty (not yet earned), full (claimable),
 *  full and dimmed (already claimed). */
export function rewardProgress(reward: ClaimableCosmeticReward): number {
  return reward.claimed || reward.eligible ? 1 : 0;
}

/** The server's `preview` string is data, not a CSS token: it arrives as e.g.
 *  "frame_brass" and must never reach a class attribute unnormalised. */
export function previewToken(preview: string): string {
  return preview.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "default";
}

export function slotPreviewClass(slot: CosmeticSlot, preview: string): string {
  return `hub-preview-v2 hub-preview-v2--${slot} hub-preview-v2--${slot}-${previewToken(preview)}`;
}

export const slotIcons: Record<CosmeticSlot, IconName> = { avatar_frame: "crown", flag_color: "flag", nameplate: "scroll" };

export const slotLabels: Record<CosmeticSlot, string> = { avatar_frame: "Khung", flag_color: "Cờ", nameplate: "Bảng tên" };

export type HubTabId = "profile" | "inventory" | "shop";

export const hubTabs: Array<{ id: HubTabId; icon: IconName; label: string }> = [
  { id: "profile", icon: "crown", label: "Hồ sơ" },
  { id: "inventory", icon: "chest", label: "Túi" },
  { id: "shop", icon: "coin", label: "Shop" },
];
