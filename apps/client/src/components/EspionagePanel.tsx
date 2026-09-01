import type { SpyMission } from "@kingdoms/shared";
import { spyMissionConfig } from "@kingdoms/shared";
import * as api from "../api.js";
import { useGame } from "../state.js";

const statusLabels: Record<string, string> = { in_progress: "Đang chạy", success: "Thành công", intercepted: "Bị chặn", failed: "Thất bại" };
const missionLabels = { scout: "Trinh sát", sabotage: "Phá hoại", steal: "Đánh cắp", counter_intel: "Phản gián" } as const;

function reportLabel(mission: SpyMission): string {
  const report = mission.report as { resources?: Record<string, number>; buildings?: Record<string, number>; armies?: unknown[]; building?: string; supplyDamaged?: boolean; stolen?: Record<string, number> } | undefined;
  if (!report) return "";
  if (report.stolen) return `Lấy trộm: gỗ ${report.stolen.wood ?? 0}, đá ${report.stolen.stone ?? 0}, sắt ${report.stolen.iron ?? 0}`;
  if (report.building !== undefined || report.supplyDamaged) return `Phá ${report.building ?? "(?)"}; làm suy yếu tiếp tế địch`;
  if (report.resources || report.buildings || report.armies) return `Nhìn thấy ~${JSON.stringify(report.armies?.length ?? 0)} đạo quân, công trình khả dĩ`;
  return "";
}

export function EspionagePanel() {
  const { state, addNotice } = useGame();
  const session = state.session!; const snapshot = state.snapshot!;
  const otherPlayers = Object.keys(snapshot.scores).filter(id => id !== session.player.id).map(id => ({ id, displayName: snapshot.cities.find(c => c.playerId === id)?.playerName ?? id }));

  return <section className="espionage-panel">
    <h2>Tình báo</h2>
    <p className="hint">Trinh sát nhìn rõ tài nguyên & quân địch; phá hoại hạ cấp công trình; đánh cắp lấy tài nguyên về thành. Chi phí (sắt): trinh sát {spyMissionConfig.scout.baseCost}, phá hoại {spyMissionConfig.sabotage.baseCost}, đánh cắp {spyMissionConfig.steal.baseCost} — phe Màn Che trả ít hơn 20%.</p>
    <div className="spy-launch">
      <select id="spy-target">{otherPlayers.map(p => <option value={p.id} key={p.id}>{p.displayName}</option>)}</select>
      <select id="spy-type"><option value="scout">Trinh sát</option><option value="sabotage">Phá hoại</option><option value="steal">Đánh cắp</option></select>
      <button onClick={() => { const target = (document.getElementById("spy-target") as HTMLSelectElement).value; const type = (document.getElementById("spy-type") as HTMLSelectElement).value as "scout" | "sabotage" | "steal"; if (target) api.launchSpy(session.token, target, type).catch(e => addNotice(e.message)); }}>Gửi điệp vụ</button>
      <button onClick={() => api.activateCounterIntel(session.token).catch(e => addNotice(e.message))}>Bật phản gián</button>
    </div>
    {snapshot.spyMissions?.filter(m => m.actorPlayerId === session.player.id).map(m => (
      <div className="spy-mission" key={m.id}>
        <strong>{missionLabels[m.missionType]}</strong>
        <span className="hint">{statusLabels[m.status] ?? m.status}</span>
        {m.status === "success" && reportLabel(m) && <span className="hint">{reportLabel(m)}</span>}
      </div>
    ))}
  </section>;
}