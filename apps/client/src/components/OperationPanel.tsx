import { useEffect, useState } from "react";
import type { Army, OperationAction } from "@kingdoms/shared";
import { useGame } from "../state.js";
import { formatResources } from "../vocabulary.js";
import { Button } from "../ui/Button.js";
import { Panel, PanelBody, PanelHeader } from "../ui/Panel.js";
import { PendingChip } from "./PendingChip.js";

const phaseLabels = { briefing: "Chọn tuyến", approach: "Tiếp cận", first_contact: "Chạm địch", escalation: "Leo thang", extraction: "Rút quân", debrief: "Kết toán" } as const;
const statusLabels: Record<string, string> = { BRIEFING: "Chuẩn bị", RUNNING: "Đang diễn ra", AWAITING_DECISION: "Chờ quyết định", PAUSED: "Đã tạm dừng", COMPLETED: "Hoàn thành", FAILED: "Thất bại" };

export function OperationPanel() {
  const { state, runCommand } = useGame();
  const snapshot = state.snapshot;
  const playerId = state.session?.player.id;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  if (!snapshot || !playerId) return null;
  const run = snapshot.activeOperation;
  const availableArmy = snapshot.armies.find((army): army is Army => army.ownerPlayerId === playerId && army.strength > 0 && Boolean(army.composition && army.commanderId && army.stance) && !army.deployedOperationId && !army.attackOrder && army.targetX === undefined);

  const start = () => availableArmy && void runCommand({ kind: "operation_start", label: "Bắt đầu chiến dịch Biên Cương", path: "/api/commands/operation/start", body: { armyId: availableArmy.id, templateId: "border_expedition" } });
  if (!run) return <Panel accent="amber" className="operation-panel" aria-label="Chiến dịch tác chiến">
    <PanelHeader title="Chiến dịch tác chiến" />
    <PanelBody>
      <p className="kom-meta">Một chiến dịch solo khoảng 20 phút với tuyến đường, chạm địch và quyết định rút quân.</p>
      <Button variant="primary" disabled={!availableArmy} reason={!availableArmy ? "Cần một đạo quân v2 đang rảnh." : undefined} onClick={start}>Bắt đầu Biên Cương</Button>
      <PendingChip kind="operation_start" />
    </PanelBody>
  </Panel>;

  const estimated = run.status === "RUNNING" ? Math.max(0, now - Date.parse(run.lastAdvancedAt)) * run.speed : 0;
  const elapsed = Math.min(20 * 60_000, run.logicalElapsedMs + estimated);
  const minutes = Math.floor(elapsed / 60_000); const seconds = Math.floor(elapsed / 1000) % 60;
  const timeControl = (action: "pause" | "resume" | "set_speed", speed?: 1 | 2) => void runCommand({ kind: "operation_time_control", label: action === "pause" ? "Tạm dừng chiến dịch" : action === "resume" ? "Tiếp tục chiến dịch" : `Tốc độ ${speed}x`, path: "/api/commands/operation/time-control", body: { operationId: run.id, action, speed } });
  const choose = (action: OperationAction) => run.currentDecision && void runCommand({ kind: "operation_act", label: "Quyết định chiến dịch", path: "/api/commands/operation/act", body: { operationId: run.id, decisionId: run.currentDecision.id, action } });

  return <Panel accent={run.status === "FAILED" ? "crimson" : run.status === "COMPLETED" ? "teal" : "amber"} className="operation-panel" aria-label="Chiến dịch tác chiến">
    <PanelHeader title="Biên Cương" />
    <PanelBody>
      <div className="operation-summary"><strong>{statusLabels[run.status] ?? run.status}</strong><span>{phaseLabels[run.phase]} · <span className="kom-num">{minutes}:{String(seconds).padStart(2, "0")}</span> / 20:00</span></div>
      {run.variant && <p className="kom-meta">Biến thể #{run.variant.quadrant + 1} · AI {run.variant.enemyDoctrine} · {run.variant.mutator.replaceAll("_", " ")} · thưởng ×{run.variant.rewardMultiplier.toFixed(1)}</p>}
      <div className="city-view-progress-bar" role="progressbar" aria-label="Tiến độ chiến dịch" aria-valuenow={elapsed} aria-valuemin={0} aria-valuemax={20 * 60_000}><div className="city-view-progress-fill" style={{ width: `${elapsed / (20 * 60_000) * 100}%` }} /></div>
      {run.currentDecision && <section className="operation-decision"><strong>Quyết định tiếp theo</strong>{run.currentDecision.options.map(option => <div key={option.action}><span><strong>{option.label}</strong><small>{option.preview}</small></span><Button density="compact" variant="secondary" onClick={() => choose(option.action)}>Chọn</Button></div>)}</section>}
      {(run.status === "RUNNING" || run.status === "PAUSED") && <div className="operation-controls">
        <Button density="compact" variant="ghost" onClick={() => timeControl(run.status === "PAUSED" ? "resume" : "pause")}>{run.status === "PAUSED" ? "Tiếp tục" : "Tạm dừng"}</Button>
        <Button density="compact" variant={run.speed === 1 ? "secondary" : "ghost"} aria-pressed={run.speed === 1} onClick={() => timeControl("set_speed", 1)}>1x</Button>
        <Button density="compact" variant={run.speed === 2 ? "secondary" : "ghost"} aria-pressed={run.speed === 2} onClick={() => timeControl("set_speed", 2)}>2x</Button>
      </div>}
      {run.outcome && <section className="operation-debrief"><strong>{run.outcome === "victory" ? "Chiến thắng" : run.outcome === "extracted" ? "Rút quân an toàn" : "Chiến dịch thất bại"}</strong><p className="kom-meta">Quyết định: {run.decisions.length} · Tiếp tế đã dùng: {run.supplySpent} · Thưởng: {formatResources(run.reward ?? {}, "Không có")}</p></section>}
      <PendingChip kind="operation_act" match={{ operationId: run.id }} /><PendingChip kind="operation_time_control" match={{ operationId: run.id }} />
    </PanelBody>
  </Panel>;
}
