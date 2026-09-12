import { randomUUID } from "node:crypto";
import { campaignMissions, commanderUnlockChapter, gameRules, initialCommanderCatalog, technologyCatalog, type Army, type CampaignMission, type CampaignProgress, type ResearchQueue, type TechnologyId } from "@kingdoms/shared";
import type { GameState } from "./types.js";
import { CommandRegistry } from "./command-registry.js";
import { CombatRepository } from "./combat.js";
import { LogisticsRepository } from "./logistics.js";
import { explorationContains, refreshExploration } from "./exploration.js";

const campaignFor = (state: GameState, playerId: string): CampaignProgress => state.campaignProgress[playerId] ??= { playerId, completedMissionIds: [], claimedFirstClearIds: [], unlockedChapter: 1 };
const researchFor = (state: GameState, playerId: string): ResearchQueue => state.researchQueues[playerId] ??= { playerId, items: [] };

export class ProgressionRepository {
  constructor(private readonly combat: CombatRepository, private readonly logistics: LogisticsRepository, private readonly commands: CommandRegistry = new CommandRegistry()) {}

  startResearch(commandId: string, technologyId: TechnologyId, playerId: string, state: GameState): string {
    const city = state.cities.find(item => item.playerId === playerId);
    if (!city) throw new Error("CITY_ACCESS_DENIED");
    if ((city.buildings.academy ?? 0) < 1) throw new Error("BUILDING_REQUIRED");
    const progress = state.technologyProgress[playerId] ??= { playerId, unlocked: [] };
    const rule = technologyCatalog[technologyId];
    if (progress.unlocked.includes(technologyId)) throw new Error("TECH_ALREADY_UNLOCKED");
    if (rule.prerequisite && !progress.unlocked.includes(rule.prerequisite)) throw new Error("TECH_PREREQUISITE_REQUIRED");
    const queue = researchFor(state, playerId);
    if (queue.items.length >= 1) throw new Error("RESEARCH_QUEUE_FULL");
    if (!this.commands.claim(commandId)) return "already_processed";
    const now = Date.now();
    queue.items.push({ id: `${playerId}-${commandId}`, playerId, technologyId, startedAt: new Date(now).toISOString(), completesAt: new Date(now + rule.durationSeconds * 1000).toISOString() });
    return "accepted";
  }

  completeMission(commandId: string, missionId: string, armyId: string | undefined, playerId: string, state: GameState): { status: string; missionId: string; victor: string; reportId: string } {
    const mission = campaignMissions.find(item => item.id === missionId);
    if (!mission) throw new Error("MISSION_NOT_FOUND");
    const progress = campaignFor(state, playerId);
    if (progress.completedMissionIds.includes(missionId)) throw new Error("MISSION_ALREADY_COMPLETED");
    if (mission.chapter > progress.unlockedChapter) throw new Error("MISSION_LOCKED");
    if (mission.chapter > 1) {
      const previous = campaignMissions.filter(item => item.chapter === mission.chapter - 1);
      if (previous.some(item => !progress.completedMissionIds.includes(item.id))) throw new Error("MISSION_CHAPTER_LOCKED");
    }
    // Every mission — combat or not — lives at a spot on the world the player must have seen.
    // For the scout mission this *is* the condition; for the others it keeps one code path.
    // Armies reveal a radius of 14 tiles each snapshot, so an army standing at the target has
    // always explored it by the time it can act.
    if (!explorationContains(refreshExploration(state, playerId), mission.target.x, mission.target.y)) throw new Error("MISSION_TARGET_UNEXPLORED");
    if (mission.kind !== "combat") {
      if (!this.conditionMet(mission, playerId, state)) throw new Error("MISSION_CONDITION_UNMET");
      if (!this.commands.claim(commandId)) return { status: "already_processed", missionId, victor: "unknown", reportId: "" };
      this.recordCompletion(mission, playerId, state);
      // Non-combat completions pay resources into the player's first city — there is no
      // commander in the field to earn XP.
      this.grantResources(mission.rewardResources, state.cities.find(item => item.playerId === playerId));
      return { status: "accepted", missionId, victor: "none", reportId: "" };
    }
    if (!armyId) throw new Error("ARMY_REQUIRED");
    const army = state.armies.find(item => item.id === armyId && item.ownerPlayerId === playerId);
    if (!army || army.strength <= 0) throw new Error("ARMY_ACCESS_DENIED");
    if (army.attackOrder || army.targetX !== undefined || army.targetY !== undefined) throw new Error("ARMY_IN_TRANSIT");
    if (!army.composition || !army.commanderId || !army.stance) throw new Error("ARMY_V2_REQUIRED");
    if (Math.abs(army.x - mission.target.x) + Math.abs(army.y - mission.target.y) > gameRules.campaign.arrivalRadius) throw new Error("MISSION_TARGET_NOT_REACHED");
    if (!this.commands.claim(commandId)) return { status: "already_processed", missionId, victor: "unknown", reportId: "" };
    const npcCommanderId = `campaign-commander-${mission.chapter}`;
    if (!state.commanders.some(item => item.id === npcCommanderId)) state.commanders.push({ id: npcCommanderId, ownerPlayerId: "npc", name: `Thủ lĩnh chương ${mission.chapter}`, specialty: mission.chapter === 2 ? "cavalry" : "infantry", level: mission.chapter + 1, xp: 0, neutral: true });
    // The NPC holds the objective, not the army's square — the player had to walk there.
    const npc = this.makeOpponent(`${commandId}:${mission.id}`, army, npcCommanderId, mission.chapter, mission.target.x, mission.target.y);
    state.armies.push(npc);
    const seed = Array.from(`${commandId}:${mission.id}`).reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 17);
    const report = this.combat.resolveEncounter(army, npc, seed, state, undefined, commandId, false, mission.terrain);
    // The mission NPC is transient whatever the outcome. A win already removed
    // it (wipe-only victory); a draw or loss must remove it too, or every retry
    // strands another copy in the shared world for other players to find.
    state.armies = state.armies.filter(item => item.id !== npc.id);
    if (report.victor !== "attacker") return { status: "accepted", missionId, victor: report.victor, reportId: report.id };
    this.recordCompletion(mission, playerId, state);
    const commander = state.commanders.find(item => item.id === army.commanderId);
    if (commander) {
      commander.xp += mission.rewardXp;
      while (commander.level < 10 && commander.xp >= commander.level * 100) { commander.xp -= commander.level * 100; commander.level += 1; }
    }
    return { status: "accepted", missionId, victor: report.victor, reportId: report.id };
  }

  patrol(commandId: string, missionId: string, armyId: string, playerId: string, state: GameState): { status: string; missionId: string; victor: string; reportId: string } {
    const mission = campaignMissions.find(item => item.id === missionId);
    if (!mission) throw new Error("MISSION_NOT_FOUND");
    const progress = campaignFor(state, playerId);
    if (campaignMissions.some(item => !progress.completedMissionIds.includes(item.id))) throw new Error("PATROL_LOCKED");
    const army = state.armies.find(item => item.id === armyId && item.ownerPlayerId === playerId);
    if (!army || army.strength <= 0) throw new Error("ARMY_ACCESS_DENIED");
    if (army.attackOrder || army.targetX !== undefined || army.targetY !== undefined) throw new Error("ARMY_IN_TRANSIT");
    if (!army.composition || !army.commanderId || !army.stance) throw new Error("ARMY_V2_REQUIRED");
    if (!this.commands.claim(commandId)) return { status: "already_processed", missionId, victor: "unknown", reportId: "" };
    const npcCommanderId = `patrol-commander-${mission.chapter}`;
    if (!state.commanders.some(item => item.id === npcCommanderId)) state.commanders.push({ id: npcCommanderId, ownerPlayerId: "npc", name: `Patrol commander ${mission.chapter}`, specialty: mission.chapter === 2 ? "cavalry" : "infantry", level: mission.chapter + 1, xp: 0, neutral: true });
    // A patrol sweeps where the army stands — no objective to walk to.
    const npc = this.makeOpponent(`patrol:${mission.id}:${commandId}`, army, npcCommanderId, mission.chapter, army.x, army.y);
    state.armies.push(npc);
    const seed = Array.from(`${commandId}:${mission.id}`).reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 17);
    const report = this.combat.resolveEncounter(army, npc, seed, state, undefined, commandId, false, mission.terrain);
    // Same transient lifecycle as campaign missions — the patrol NPC never
    // outlives the command that spawned it.
    state.armies = state.armies.filter(item => item.id !== npc.id);
    // Patrol pays resources on every win, scaled by the chapter being patrolled.
    // The combat rate bucket plus morale and recovery time is the real gate on
    // how often this can repeat; a loss or a draw pays nothing.
    if (report.victor === "attacker") {
      this.grantResources(gameRules.campaign.patrolRewards[mission.chapter as 1 | 2 | 3], state.cities.find(item => item.id === army.homeCityId) ?? state.cities.find(item => item.playerId === playerId));
      // Daily-quest evidence: a patrol win counts as a campaign completion,
      // separate from `battles_won`.
      state.activityCounters.campaignsCompleted[playerId] = (state.activityCounters.campaignsCompleted[playerId] ?? 0) + 1;
    }
    return { status: "accepted", missionId, victor: report.victor, reportId: report.id };
  }

  tick(state: GameState, now = Date.now()): boolean {
    let changed = false;
    for (const [playerId, queue] of Object.entries(state.researchQueues)) {
      const finished = queue.items.filter(item => Date.parse(item.completesAt) <= now);
      if (!finished.length) continue;
      const progress = state.technologyProgress[playerId] ??= { playerId, unlocked: [] };
      for (const item of finished) if (!progress.unlocked.includes(item.technologyId)) progress.unlocked.push(item.technologyId);
      queue.items = queue.items.filter(item => Date.parse(item.completesAt) > now);
      changed = true;
    }
    return changed;
  }

  private recordCompletion(mission: CampaignMission, playerId: string, state: GameState): void {
    const progress = campaignFor(state, playerId);
    progress.completedMissionIds.push(mission.id);
    progress.claimedFirstClearIds.push(mission.id);
    // Daily-quest evidence: one campaign mission completed (either a first
    // clear here or a patrol win above), distinct from `battles_won`.
    state.activityCounters.campaignsCompleted[playerId] = (state.activityCounters.campaignsCompleted[playerId] ?? 0) + 1;
    if (campaignMissions.filter(item => item.chapter === mission.chapter).every(item => progress.completedMissionIds.includes(item.id))) {
      if (mission.chapter < 3) progress.unlockedChapter = Math.max(progress.unlockedChapter, mission.chapter + 1);
      this.unlockCommander(playerId, mission.chapter, state);
    }
  }

  /** Non-combat conditions read the same durable state the snapshot publishes — city buildings
   *  for build, the logistics throughput counters for trade. The scout condition was already
   *  proven by the exploration gate at the top of `completeMission`. */
  private conditionMet(mission: CampaignMission, playerId: string, state: GameState): boolean {
    const condition = mission.condition;
    if (!condition || condition.type === "scout") return true;
    if (condition.type === "build") return state.cities.some(city => city.playerId === playerId && (city.buildings[condition.buildingId] ?? 0) >= condition.level);
    const throughput = this.logistics.snapshot().throughput[playerId];
    return !!throughput && (throughput.wood + throughput.stone + throughput.iron) >= condition.amount;
  }

  private grantResources(reward: { wood: number; stone: number; iron: number } | undefined, city: { resources: { wood: number; stone: number; iron: number } } | undefined): void {
    if (!reward || !city) return;
    city.resources.wood += reward.wood;
    city.resources.stone += reward.stone;
    city.resources.iron += reward.iron;
  }

  private unlockCommander(playerId: string, chapter: number, state: GameState): void {
    const specialty = (Object.keys(commanderUnlockChapter) as Array<keyof typeof commanderUnlockChapter>).find(item => commanderUnlockChapter[item] === chapter);
    if (!specialty) return;
    const catalog = initialCommanderCatalog.find(item => item.specialty === specialty);
    if (!catalog || state.commanders.some(item => item.ownerPlayerId === playerId && item.specialty === specialty)) return;
    state.commanders.push({ ...catalog, id: `${catalog.id}-${playerId}`, ownerPlayerId: playerId, level: 1, xp: 0, assignedArmyId: undefined });
  }

  private makeOpponent(missionId: string, army: Army, commanderId: string, chapter: number, x: number, y: number): Army {
    // Sized against what the mixed engine can actually annihilate in 10 rounds
    // (damage = power/20, 10 rounds, wipe-only victory). Simulated across legal
    // player compositions x stances x terrains x seeds with the worst-case
    // starter commander (logistics), the sizes below win 88% / 85% / 90% with
    // zero losses: 25 vs a 100-troop starter, 60 vs 150, 50 vs 200 behind a
    // defensive stance. The old 150/160/230 line was above every budget — 23k+
    // simulated legal armies won zero chapter-1 missions.
    const frontline = chapter === 1 ? 17 : chapter === 2 ? 45 : 30;
    const backline = chapter === 1 ? 8 : chapter === 2 ? 15 : 10;
    const flank = chapter === 3 ? 10 : 0;
    const strength = frontline + backline + flank;
    return { id: randomUUID(), ownerType: "npc", ownerPlayerId: null, npcKind: "migration", sourceWorldEventId: `campaign:${missionId}`, x, y, commanderId, composition: { frontline: { id: `campaign-front-${missionId}`, troopType: chapter === 2 ? "spearmen" : "shield_infantry", position: "frontline", count: frontline }, backline: { id: `campaign-back-${missionId}`, troopType: "archers", position: "backline", count: backline }, flank: flank > 0 ? { id: `campaign-flank-${missionId}`, troopType: "cavalry", position: "flank", count: flank } : null }, stance: chapter === 3 ? "defensive" : "balanced", unitType: "infantry", strength, morale: 100, formation: "line", supply: 100 };
  }
}
