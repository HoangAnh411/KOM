import { campaignMissions, technologyCatalog, technologyIds, type TechnologyId } from "@kingdoms/shared";
import { useGame } from "../state.js";
import { Button } from "../ui/Button.js";
import { Panel, PanelBody, PanelHeader } from "../ui/Panel.js";
import { PendingChip } from "./PendingChip.js";

const branchLabels = { production: "Sản xuất", transport: "Vận tải", military_logistics: "Hậu cần quân đội" } as const;

export function ProgressionPanel() {
  const { state, runCommand } = useGame();
  const snapshot = state.snapshot;
  const playerId = state.session?.player.id;
  if (!snapshot || !playerId) return null;
  const city = snapshot.cities.find(item => item.playerId === playerId);
  const campaign = snapshot.campaignProgress?.[playerId];
  const completedMissionIds: string[] = campaign?.completedMissionIds ?? [];
  const unlockedChapter = campaign?.unlockedChapter ?? 1;
  const army = snapshot.armies.find(item => item.ownerPlayerId === playerId && item.composition);
  const research = snapshot.technologyProgress?.[playerId]?.unlocked ?? [];
  const queue = snapshot.researchQueues?.[playerId];
  const nextMission = campaignMissions.find(item => !completedMissionIds.includes(item.id) && item.chapter <= unlockedChapter);
  const patrolMission = campaignMissions[completedMissionIds.length % campaignMissions.length];
  const campaignComplete = completedMissionIds.length === campaignMissions.length;
  const canResearch = Boolean(city && (city.buildings.academy ?? 0) > 0 && !queue?.items.length);
  return <Panel accent="amber" className="progression-panel" aria-label="Chiến dịch và nghiên cứu">
    <PanelHeader title="Chiến dịch & nghiên cứu" />
    <PanelBody>
      <section>
        <strong>Chiến dịch</strong>
        <p className="kom-meta">Chương {unlockedChapter} · {completedMissionIds.length}/{campaignMissions.length} nhiệm vụ hoàn tất</p>
        {nextMission && <div className="progression-next">
          <strong>{nextMission.title}</strong>
          <span className="kom-meta">{nextMission.description} · Bài học: {nextMission.lesson}</span>
          <Button density="compact" variant="secondary" disabled={!army} reason={!army ? "Cần một đạo quân v2." : undefined} onClick={() => void runCommand({ kind: "complete_campaign_mission", label: "Xuất quân chiến dịch", path: "/api/commands/campaign/complete", body: { missionId: nextMission.id, armyId: army?.id } })}>Xuất quân</Button>
          <PendingChip kind="complete_campaign_mission" match={{ missionId: nextMission.id }} />
        </div>}
        {!nextMission && !campaignComplete && <p className="kom-meta">Đã hoàn tất phần đang mở. Hoàn tất các nhiệm vụ để mở chương tiếp.</p>}
        {campaignComplete && patrolMission && <div className="progression-next">
          <strong>Tuần tra PvE</strong>
          <span className="kom-meta">Lặp lại: {patrolMission.title} · thưởng XP theo chiến thắng, không nhận thưởng mở khóa lại.</span>
          <Button density="compact" variant="secondary" disabled={!army} reason={!army ? "Cần một đạo quân v2." : undefined} onClick={() => void runCommand({ kind: "patrol_campaign", label: "Tuần tra PvE", path: "/api/commands/campaign/patrol", body: { missionId: patrolMission.id, armyId: army?.id } })}>Tuần tra</Button>
          <PendingChip kind="patrol_campaign" match={{ missionId: patrolMission.id }} />
        </div>}
      </section>
      <section>
        <strong>Nghiên cứu</strong>
        <p className="kom-meta">{queue?.items[0] ? `Đang nghiên cứu ${technologyCatalog[queue.items[0].technologyId].name}.` : city && (city.buildings.academy ?? 0) > 0 ? "Học viện sẵn sàng." : "Cần xây Học viện."}</p>
        <div className="progression-tech-list">
          {technologyIds.map(id => {
            const rule = technologyCatalog[id];
            const unlocked = research.includes(id);
            const prerequisiteMissing = Boolean(rule.prerequisite && !research.includes(rule.prerequisite));
            return <div className="progression-tech" key={id}>
              <span><strong>{rule.name}</strong> <small>· {branchLabels[rule.branch]}</small></span>
              <Button density="compact" variant="ghost" disabled={unlocked || prerequisiteMissing || !canResearch} reason={unlocked ? "Đã mở khóa." : prerequisiteMissing ? `Cần ${technologyCatalog[rule.prerequisite!].name}.` : !canResearch ? "Học viện hoặc hàng đợi đang bận." : undefined} onClick={() => void runCommand({ kind: "start_research", label: "Bắt đầu nghiên cứu", path: "/api/commands/research", body: { technologyId: id } })}>{unlocked ? "Đã mở" : "Nghiên cứu"}</Button>
            </div>;
          })}
        </div>
        <PendingChip kind="start_research" />
      </section>
    </PanelBody>
  </Panel>;
}
