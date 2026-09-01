import type { Pool, PoolClient } from "pg";
import type { OnboardingProgress, OnboardingStep } from "@kingdoms/shared";
import { onboardableSteps } from "@kingdoms/shared";
import type { GameState, Player } from "./types.js";

const VARIANT = "web_alpha_v1";

// Player onboarding progress. Six steps are verified server-side from durable
// state (buildings, armies, logistics counters, battle reports); two
// UI-observed steps (city_inspected, score_viewed) are acknowledged via the
// /api/commands/onboarding/ack command. Completed steps persist in the
// player_onboarding table and merge with fresh evidence so restarts never
// regress progress. Purely cosmetic — no gameplay gating.
export class OnboardingRepository {
  private commands = new Set<string>();
  private progress = new Map<string, Set<OnboardingStep>>();
  constructor(private readonly pool?: Pool) {}

  capture(): { commands: string[]; progress: Array<[string, OnboardingStep[]]> } {
    return { commands: [...this.commands], progress: [...this.progress].map(([playerId, steps]) => [playerId, [...steps]]) };
  }
  restore(capture: { commands: string[]; progress: Array<[string, OnboardingStep[]]> }): void {
    this.commands = new Set(capture.commands);
    this.progress = new Map(capture.progress.map(([playerId, steps]) => [playerId, new Set(steps)]));
  }

  async load(state: GameState): Promise<void> {
    this.progress.clear();
    if (!this.pool) return;
    try {
      const rows = await this.pool.query<{ player_id: string; completed_steps: string[] }>(
        "SELECT player_id, completed_steps FROM player_onboarding WHERE variant = $1", [VARIANT]
      );
      for (const row of rows.rows) this.progress.set(row.player_id, new Set((row.completed_steps ?? []) as OnboardingStep[]));
    } catch (error) { console.warn("onboarding load skipped", error instanceof Error ? error.message : error); }
  }

  async persist(client: PoolClient, state: GameState): Promise<void> {
    for (const player of state.players) {
      const completed = this.progress.get(player.id);
      if (!completed || completed.size === 0) continue;
      await client.query(
        "INSERT INTO player_onboarding (player_id, variant, completed_steps, updated_at) VALUES ($1,$2,$3,now()) ON CONFLICT (player_id) DO UPDATE SET completed_steps=EXCLUDED.completed_steps, updated_at=now()",
        [player.id, VARIANT, JSON.stringify([...completed])]
      );
    }
  }

  ackStep(commandId: string, playerId: string, step: string, state: GameState): string {
    if (state.players.find(player => player.id === playerId)?.status === "banned") throw new Error("ACCOUNT_BANNED");
    if (!onboardableSteps.includes(step as (typeof onboardableSteps)[number])) throw new Error("SERVER_VERIFIED_STEP");
    if (!this.claim(commandId)) return "already_processed";
    const set = this.progress.get(playerId) ?? new Set<OnboardingStep>();
    set.add(step as OnboardingStep);
    this.progress.set(playerId, set);
    return "accepted";
  }

  progressFor(playerId: string | undefined): OnboardingProgress {
    return { variant: VARIANT, completedSteps: [...(playerId ? (this.progress.get(playerId) ?? []) : [])] };
  }

  // Merge table-stored progress with evidence derivable from the current
  // state; returns true when new steps were discovered.
  verify(state: GameState): boolean {
    let changed = false;
    for (const player of state.players) {
      const found = this.derive(player, state);
      const set = this.progress.get(player.id) ?? new Set<OnboardingStep>();
      for (const step of found) if (!set.has(step)) { set.add(step); changed = true; }
      if (set.size && !this.progress.has(player.id)) this.progress.set(player.id, set);
    }
    return changed;
  }

  private derive(player: Player, state: GameState): OnboardingStep[] {
    const found: OnboardingStep[] = [];
    const ownsCity = (predicate: (city: (typeof state.cities)[number]) => boolean) => state.cities.some(city => city.playerId === player.id && predicate(city));
    if (ownsCity(city => (city.buildings.road_depot ?? 0) >= 1)) found.push("depot_built");
    if (ownsCity(city => (city.buildings.barracks ?? 0) >= 1)) found.push("barracks_built");
    if (state.armies.some(army => army.ownerType === "player" && army.ownerPlayerId === player.id)) found.push("army_recruited");
    if ((state.logisticsCounters.harvests[player.id] ?? 0) > 0) found.push("resource_harvested");
    const exported = state.logisticsCounters.exports[player.id];
    if (exported && (exported.wood + exported.stone + exported.iron) > 0) found.push("market_exported");
    if (state.battleReports.some(report =>
      (report.victor === "attacker" && report.attacker.playerId === player.id && report.defender.npcKind === "raider") ||
      (report.victor === "defender" && report.defender.playerId === player.id && report.attacker.npcKind === "raider")
    )) found.push("raider_defeated");
    return found;
  }

  private claim(commandId: string): boolean {
    if (this.commands.has(commandId)) return false;
    this.commands.add(commandId);
    return true;
  }
}