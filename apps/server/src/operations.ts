import { createHash, randomUUID } from "node:crypto";
import { type OperationAction, type OperationDecision, type OperationRun, type OperationTemplateId } from "@kingdoms/shared";
import type { GameState } from "./types.js";
import { CommandRegistry } from "./command-registry.js";

export const operationDurationMs = 20 * 60_000;
export const operationExtractionMs = 15 * 60_000;

const decision = (id: string, phase: OperationDecision["phase"], options: OperationDecision["options"]): OperationDecision => ({ id, phase, options });
const routeDecision = () => decision("route", "briefing", [
  { action: "safe_route", label: "Tuyến tiếp tế", preview: "Ít rủi ro, chậm hơn, giữ quân nhu." },
  { action: "risky_route", label: "Đường tắt", preview: "Đến nhanh, thưởng cao hơn, tốn tiếp tế." },
]);
const contactDecision = () => decision("contact", "first_contact", [
  { action: "engage", label: "Chủ động giao chiến", preview: "Tăng tiến độ nhưng chịu tổn thất." },
  { action: "fortify", label: "Củng cố vị trí", preview: "Giảm rủi ro và tiêu hao thời gian." },
  { action: "avoid", label: "Vòng tránh", preview: "Giữ lực lượng nhưng mất cơ hội thưởng." },
]);
const extractionDecision = () => decision("extraction", "extraction", [
  { action: "extract", label: "Rút quân", preview: "Bảo toàn kết quả hiện tại." },
  { action: "press_on", label: "Tiếp tục", preview: "Nhận thưởng cao hơn nếu trụ đến cuối." },
]);

export class OperationRepository {
  constructor(private readonly commands: CommandRegistry = new CommandRegistry()) {}

  start(commandId: string, armyId: string, templateId: OperationTemplateId, playerId: string, state: GameState, now = Date.now()): OperationRun {
    if (state.activeOperations[playerId] && !["COMPLETED", "FAILED"].includes(state.activeOperations[playerId]!.status)) throw new Error("OPERATION_ALREADY_ACTIVE");
    const army = state.armies.find(item => item.id === armyId && item.ownerPlayerId === playerId);
    if (!army || army.strength <= 0) throw new Error("ARMY_ACCESS_DENIED");
    if (!army.composition || !army.commanderId || !army.stance) throw new Error("ARMY_V2_REQUIRED");
    if (army.attackOrder || army.targetX !== undefined || army.targetY !== undefined || army.deployedOperationId) throw new Error("ARMY_IN_TRANSIT");
    if (!this.commands.claim(commandId)) throw new Error("already_processed");
    const seed = [...`${state.season.id}:${playerId}:${commandId}`].reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 17);
    const variant = { quadrant: seed % 4, enemyDoctrine: (["defensive", "raider", "opportunist"] as const)[Math.floor(seed / 4) % 3]!, mutator: (["supply_shortage", "reinforced_enemy", "favorable_terrain"] as const)[Math.floor(seed / 12) % 3]!, rewardMultiplier: 1 + (seed % 3) * 0.1 };
    const run: OperationRun = { id: randomUUID(), playerId, seasonId: state.season.id, templateId, rulesVersion: 1, seed, committedArmyId: army.id, status: "AWAITING_DECISION", phase: "briefing", logicalElapsedMs: 0, speed: 1, lastAdvancedAt: new Date(now).toISOString(), currentDecision: routeDecision(), decisions: [], routeRisk: 0, supplySpent: variant.mutator === "supply_shortage" ? 5 : 0, battleReportIds: [], variant, revision: 0 };
    army.deployedOperationId = run.id;
    state.activeOperations[playerId] = run;
    return run;
  }

  act(commandId: string, operationId: string, decisionId: string, action: OperationAction, playerId: string, state: GameState, now = Date.now()): OperationRun {
    const run = this.active(operationId, playerId, state);
    if (run.status !== "AWAITING_DECISION" || run.currentDecision?.id !== decisionId || !run.currentDecision.options.some(option => option.action === action)) throw new Error("OPERATION_DECISION_STALE");
    if (!this.commands.claim(commandId)) throw new Error("already_processed");
    run.decisions.push({ decisionId, action, atLogicalMs: run.logicalElapsedMs });
    run.currentDecision = undefined;
    run.status = "RUNNING";
    run.pausedReason = undefined;
    run.lastAdvancedAt = new Date(now).toISOString();
    if (decisionId === "route") { run.phase = "approach"; run.routeRisk = action === "risky_route" ? 2 : 0; run.supplySpent += action === "risky_route" ? 15 : 5; }
    else if (decisionId === "contact") { run.phase = "escalation"; run.routeRisk += action === "engage" ? 1 : action === "avoid" ? -1 : 0; run.supplySpent += action === "fortify" ? 4 : action === "engage" ? 10 : 2; }
    else if (action === "extract") this.settle(run, state, "extracted", now);
    else { run.phase = "extraction"; run.routeRisk += 1; }
    run.routeRisk = Math.max(0, Math.min(2, run.routeRisk));
    run.revision++;
    return run;
  }

  timeControl(commandId: string, operationId: string, action: "pause" | "resume" | "set_speed", speed: 1 | 2 | undefined, playerId: string, state: GameState, now = Date.now()): OperationRun {
    const run = this.active(operationId, playerId, state);
    if (!this.commands.claim(commandId)) throw new Error("already_processed");
    this.advance(run, state, now);
    if (action === "pause") { if (run.status === "RUNNING") { run.status = "PAUSED"; run.pausedReason = "manual"; } }
    else if (action === "resume") { if (run.status !== "PAUSED") throw new Error("OPERATION_NOT_PAUSED"); run.status = "RUNNING"; run.pausedReason = undefined; }
    else { if (!speed) throw new Error("OPERATION_SPEED_REQUIRED"); run.speed = speed; }
    run.lastAdvancedAt = new Date(now).toISOString(); run.revision++;
    return run;
  }

  tick(state: GameState, now = Date.now()): boolean {
    let changed = false;
    for (const run of Object.values(state.activeOperations)) changed = this.advance(run, state, now) || changed;
    return changed;
  }

  private advance(run: OperationRun, state: GameState, now: number): boolean {
    if (run.status !== "RUNNING") return false;
    const previous = Date.parse(run.lastAdvancedAt);
    const realDelta = Number.isFinite(previous) ? Math.max(0, Math.min(now - previous, 30_000)) : 0;
    if (!realDelta) return false;
    run.logicalElapsedMs = Math.min(operationDurationMs, run.logicalElapsedMs + realDelta * run.speed);
    run.lastAdvancedAt = new Date(now).toISOString();
    const army = state.armies.find(item => item.id === run.committedArmyId);
    if (!army || army.strength <= 0) this.settle(run, state, "defeat", now);
    else if (!run.decisions.some(item => item.decisionId === "contact") && run.logicalElapsedMs >= 6 * 60_000) { run.status = "AWAITING_DECISION"; run.phase = "first_contact"; run.currentDecision = contactDecision(); }
    else if (!run.decisions.some(item => item.decisionId === "extraction") && run.logicalElapsedMs >= operationExtractionMs) { run.status = "AWAITING_DECISION"; run.phase = "extraction"; run.currentDecision = extractionDecision(); }
    else if (run.logicalElapsedMs >= operationDurationMs) this.settle(run, state, "victory", now);
    run.revision++;
    return true;
  }

  private settle(run: OperationRun, state: GameState, outcome: "extracted" | "victory" | "defeat", now: number): void {
    if (run.settlementAppliedAt) return;
    const army = state.armies.find(item => item.id === run.committedArmyId);
    if (army) { army.deployedOperationId = undefined; army.supply = Math.max(0, army.supply - run.supplySpent); }
    run.status = outcome === "defeat" ? "FAILED" : "COMPLETED"; run.phase = "debrief"; run.outcome = outcome;
    const multiplier = run.variant?.rewardMultiplier ?? 1;
    run.reward = outcome === "victory" ? { wood: Math.floor((220 + run.routeRisk * 40) * multiplier), stone: Math.floor(140 * multiplier), iron: Math.floor(50 * multiplier) } : outcome === "extracted" ? { wood: 100, stone: 60, iron: 20 } : { wood: 0, stone: 0, iron: 0 };
    const city = state.cities.find(item => item.playerId === run.playerId);
    if (city) { city.resources.wood += run.reward.wood; city.resources.stone += run.reward.stone; city.resources.iron += run.reward.iron; }
    run.currentDecision = undefined; run.settlementAppliedAt = new Date(now).toISOString();
    run.checksum = createHash("sha256").update(JSON.stringify({ seed: run.seed, variant: run.variant, decisions: run.decisions, outcome: run.outcome, reward: run.reward })).digest("hex");
  }

  private active(operationId: string, playerId: string, state: GameState): OperationRun {
    const run = state.activeOperations[playerId];
    if (!run || run.id !== operationId) throw new Error("OPERATION_NOT_FOUND");
    if (["COMPLETED", "FAILED"].includes(run.status)) throw new Error("OPERATION_FINISHED");
    return run;
  }
}
