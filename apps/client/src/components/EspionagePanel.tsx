import { useState } from "react";
import type { SpyMission } from "@kingdoms/shared";
import { spyMissionConfig } from "@kingdoms/shared";
import { useGame } from "../state.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";
import { Panel, PanelBody, PanelFooter, PanelHeader } from "../ui/Panel.js";
import { StatusChip } from "../ui/Status.js";
import type { UiState } from "../ui/tokens.js";
import { spyMissionLabels } from "../vocabulary.js";

type LaunchableMission = "scout" | "sabotage" | "steal";

const statusLabels: Record<string, string> = { in_progress: "Đang chạy", success: "Thành công", intercepted: "Bị chặn", failed: "Thất bại" };
/* A mission outcome is a UI state, but not the same word: "Bị chặn" is what the
 * player reads, `hostile` is how it is coloured. Intercepted is crimson because
 * someone did it to you; failed is amber because nobody did. */
const statusStates: Record<string, UiState> = { in_progress: "pending", success: "success", intercepted: "hostile", failed: "warning" };

function reportLabel(mission: SpyMission): string {
  const report = mission.report as { resources?: Record<string, number>; buildings?: Record<string, number>; armies?: unknown[]; building?: string; supplyDamaged?: boolean; stolen?: Record<string, number> } | undefined;
  if (!report) return "";
  if (report.stolen) return `Lấy trộm: gỗ ${report.stolen.wood ?? 0}, đá ${report.stolen.stone ?? 0}, sắt ${report.stolen.iron ?? 0}`;
  if (report.building !== undefined || report.supplyDamaged) return `Phá ${report.building ?? "(?)"}; làm suy yếu tiếp tế địch`;
  if (report.resources || report.buildings || report.armies) return `Nhìn thấy ~${JSON.stringify(report.armies?.length ?? 0)} đạo quân, công trình khả dĩ`;
  return "";
}

export function EspionagePanel() {
  const { state, runCommand } = useGame();
  const session = state.session!; const snapshot = state.snapshot!;
  const otherPlayers = Object.keys(snapshot.scores).filter(id => id !== session.player.id).map(id => ({ id, displayName: snapshot.cities.find(c => c.playerId === id)?.playerName ?? id }));
  const [targetId, setTargetId] = useState("");
  const [missionType, setMissionType] = useState<LaunchableMission>("scout");
  const target = targetId || otherPlayers[0]?.id || "";
  const missions = snapshot.spyMissions?.filter(m => m.actorPlayerId === session.player.id) ?? [];

  return <Panel accent="violet" className="espionage-panel" aria-label="Tình báo">
    <PanelHeader title={<><Icon name="eye" /> Tình báo</>} />
    <PanelBody>
      <p className="hint">Trinh sát nhìn rõ tài nguyên & quân địch; phá hoại hạ cấp công trình; đánh cắp lấy tài nguyên về thành. Chi phí (sắt): trinh sát {spyMissionConfig.scout.baseCost}, phá hoại {spyMissionConfig.sabotage.baseCost}, đánh cắp {spyMissionConfig.steal.baseCost} — phe Màn Che trả ít hơn 20%.</p>
      {missions.map(m => {
        const uiState = statusStates[m.status];
        return <div className="spy-mission" key={m.id}>
          <strong>{spyMissionLabels[m.missionType]}</strong>
          {uiState
            ? <StatusChip state={uiState}>{statusLabels[m.status] ?? m.status}</StatusChip>
            : <span className="hint">{statusLabels[m.status] ?? m.status}</span>}
          {m.status === "success" && reportLabel(m) && <span className="hint">{reportLabel(m)}</span>}
        </div>;
      })}
    </PanelBody>
    <PanelFooter>
      <div className="spy-launch">
        <select value={target} onChange={event => setTargetId(event.target.value)} aria-label="Mục tiêu tình báo">{otherPlayers.map(p => <option value={p.id} key={p.id}>{p.displayName}</option>)}</select>
        <select value={missionType} onChange={event => setMissionType(event.target.value as LaunchableMission)} aria-label="Loại điệp vụ"><option value="scout">Trinh sát</option><option value="sabotage">Phá hoại</option><option value="steal">Đánh cắp</option></select>
        <Button variant="primary" disabled={!target} reason="Chưa có đối thủ nào để nhắm tới." onClick={() => runCommand({ kind: "spy_launch", label: "Gửi điệp vụ", path: "/api/commands/spy/launch", body: { targetPlayerId: target, missionType } }).catch(() => undefined)}>Gửi điệp vụ</Button>
        <Button variant="secondary" onClick={() => runCommand({ kind: "counter_intel", label: "Bật phản gián", path: "/api/commands/spy/counter-intel", body: {} }).catch(() => undefined)}>Bật phản gián</Button>
      </div>
    </PanelFooter>
  </Panel>;
}
