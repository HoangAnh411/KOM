import { useEffect, useState } from "react";
import { campaignMissions, gameRules, regionAt, technologyCatalog, technologyIds, dailyQuests, dailyQuestMilestones, type CampaignMission, type TechnologyId, type WorldSnapshot } from "@kingdoms/shared";
import { useGame } from "../state.js";
import { usePanelAnchor } from "../panel-anchors.js";
import { explorationBit } from "../map-geometry.js";
import { formatResources, missionKindLabels } from "../vocabulary.js";
import { queueProgress } from "../queue-progress.js";
import { Button } from "../ui/Button.js";
import { Panel, PanelBody, PanelHeader } from "../ui/Panel.js";
import { ProgressMeter } from "../ui/ProgressMeter.js";
import { PendingChip } from "./PendingChip.js";

const branchLabels = { production: "Sản xuất", transport: "Vận tải", military_logistics: "Hậu cần quân đội" } as const;

const buildingName = (buildingId: string): string =>
  (gameRules.buildings as Record<string, { name: string } | undefined>)[buildingId]?.name ?? "công trình";

/** Everything the next-mission card needs to render its action, derived once.
 *  A mission kind decides both the button's word and which fact gates it — the
 *  same fact the server checks, read from the same snapshot fields. */
function missionAction(mission: CampaignMission, snapshot: WorldSnapshot, playerId: string, armyId: string | undefined) {
  const target = mission.target;
  if (mission.kind === "combat") {
    if (!armyId) return { label: "Xuất quân", disabled: true, reason: "Cần một đạo quân v2." } as const;
    const army = snapshot.armies.find(item => item.id === armyId);
    const distance = army ? Math.abs(army.x - target.x) + Math.abs(army.y - target.y) : Infinity;
    const radius = gameRules.campaign.arrivalRadius;
    return distance > radius
      ? { label: "Xuất quân", disabled: true, reason: `Đạo quân chưa tới mục tiêu (còn ${distance - radius} ô).` } as const
      : { label: "Xuất quân", disabled: false, reason: undefined } as const;
  }
  if (mission.kind === "scout") {
    const explored = explorationBit(snapshot.exploration, target.x, target.y);
    return explored
      ? { label: "Trinh sát", disabled: false, reason: undefined } as const
      : { label: "Trinh sát", disabled: true, reason: "Chưa khám phá vùng mục tiêu." } as const;
  }
  if (mission.kind === "build") {
    const condition = mission.condition?.type === "build" ? mission.condition : undefined;
    const level = condition ? Math.max(...snapshot.cities.filter(city => city.playerId === playerId).map(city => city.buildings[condition.buildingId] ?? 0), 0) : 1;
    return condition && level >= condition.level
      ? { label: "Hoàn tất", disabled: false, reason: undefined } as const
      : { label: "Hoàn tất", disabled: true, reason: condition ? `Cần ${buildingName(condition.buildingId)} cấp ${condition.level}.` : "Điều kiện nhiệm vụ không rõ." } as const;
  }
  const condition = mission.condition?.type === "trade" ? mission.condition : undefined;
  const delivered = condition
    ? Object.values(snapshot.logistics.throughput[playerId] ?? {}).reduce((sum, value) => sum + (value ?? 0), 0)
    : 0;
  return condition && delivered >= condition.amount
    ? { label: "Hoàn tất", disabled: false, reason: undefined } as const
    : { label: "Hoàn tất", disabled: true, reason: condition ? `Cần giao thêm ${condition.amount - delivered} tài nguyên.` : "Điều kiện nhiệm vụ không rõ." } as const;
}

export function ProgressionPanel() {
  const { state, runCommand, setSelection } = useGame();
  const snapshot = state.snapshot;
  const playerId = state.session?.player.id;
  // The daily board counts down to its own 00:00 UTC roll, so it needs its own
  // clock — the same one-second interval the header runs for the season.
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
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
  const action = nextMission ? missionAction(nextMission, snapshot, playerId, army?.id) : undefined;
  const tradeProgress = nextMission?.condition?.type === "trade"
    ? Object.values(snapshot.logistics.throughput[playerId] ?? {}).reduce((sum, value) => sum + (value ?? 0), 0)
    : undefined;
  // The daily board is optional on the snapshot — an older server speaks no
  // `dailyQuests` field, and the section simply hides rather than breaking.
  const board = snapshot.dailyQuests;
  const refreshSeconds = board ? Math.max(0, Math.ceil((Date.parse(board.refreshesAt) - now) / 1000)) : 0;
  const refreshMinutes = Math.floor(refreshSeconds / 60);
  // A completed mission's feed row jumps here — the panel that offers the next
  // one is where "Nhiệm vụ xong" leads.
  const anchor = usePanelAnchor<HTMLElement>("progression");
  return <Panel panelRef={anchor} accent="amber" className="progression-panel" aria-label="Chiến dịch và nghiên cứu">
    <PanelHeader title="Chiến dịch & nghiên cứu" />
    <PanelBody>
      {board && <section className="daily-quests">
        <strong>Nhiệm vụ hằng ngày</strong>
        <p className="kom-meta">Hôm nay · <span className="kom-num">{board.points}</span>/10 điểm · làm mới sau <span className="kom-num">{refreshMinutes}m {refreshSeconds % 60}s</span></p>
        <div className="city-view-progress-bar" role="progressbar" aria-label="Điểm nhiệm vụ hằng ngày" aria-valuenow={board.points} aria-valuemin={0} aria-valuemax={10}>
          <div className="city-view-progress-fill" style={{ width: `${Math.min(100, board.points * 10)}%` }} />
        </div>
        <ol className="onboarding-list daily-quest-list">
          {board.quests.map(quest => {
            const definition = dailyQuests.find(item => item.id === quest.questId);
            if (!definition) return null;
            const completed = quest.progress >= definition.target;
            return <li key={quest.questId} className={completed ? "step-done" : ""}>
              <span className={completed ? "step-check" : "step-dot"} aria-hidden="true">{completed ? "✓" : `${definition.points}đ`}</span>
              <span className="step-label">
                <strong>{definition.title}</strong>
                <small>{definition.description} · {Math.min(quest.progress, definition.target)}/{definition.target} · thưởng {formatResources(definition.reward, "—")}</small>
              </span>
              <span className="step-actions">
                <Button density="compact" variant="primary" disabled={quest.claimed || !completed} reason={quest.claimed ? "Đã nhận thưởng." : !completed ? "Chưa hoàn thành." : undefined} onClick={() => void runCommand({ kind: "daily_quest_claim", label: `Nhận thưởng "${definition.title}"`, path: "/api/commands/daily-quest/claim", body: { questId: quest.questId } })}>{quest.claimed ? "Đã nhận" : "Nhận"}</Button>
                <PendingChip kind="daily_quest_claim" match={{ questId: quest.questId }} />
              </span>
            </li>;
          })}
        </ol>
        <div className="daily-milestones">
          {dailyQuestMilestones.map(milestone => {
            const reached = board.points >= milestone.points;
            const claimed = board.claimedMilestones.includes(milestone.points);
            return <div className="daily-milestone" key={milestone.points}>
              <span className="kom-meta">Mốc {milestone.points} điểm · {formatResources(milestone.reward, "—")}</span>
              <span className="step-actions">
                <Button density="compact" variant="secondary" disabled={claimed || !reached} reason={claimed ? "Đã nhận mốc này." : !reached ? `Cần ${milestone.points} điểm.` : undefined} onClick={() => void runCommand({ kind: "daily_quest_claim", label: `Nhận thưởng mốc ${milestone.points} điểm`, path: "/api/commands/daily-quest/claim", body: { milestone: milestone.points } })}>{claimed ? "Đã nhận" : `Nhận mốc ${milestone.points}đ`}</Button>
                <PendingChip kind="daily_quest_claim" match={{ milestone: milestone.points }} />
              </span>
            </div>;
          })}
        </div>
      </section>}
      <section>
        <strong>Chiến dịch</strong>
        <p className="kom-meta">Chương {unlockedChapter} · {completedMissionIds.length}/{campaignMissions.length} nhiệm vụ hoàn tất</p>
        {nextMission && <div className="progression-next">
          <strong>{nextMission.title} <small>· {missionKindLabels[nextMission.kind]}</small></strong>
          <span className="kom-meta">{nextMission.description} · Bài học: {nextMission.lesson}</span>
          <span className="kom-meta">Mục tiêu: {nextMission.target.x},{nextMission.target.y} · {regionAt(nextMission.target.x, nextMission.target.y)?.name ?? "vùng chưa đặt tên"}</span>
          {tradeProgress !== undefined && <span className="kom-meta">Đã giao {tradeProgress}/{nextMission.condition?.type === "trade" ? nextMission.condition.amount : 0} tài nguyên.</span>}
          <Button density="compact" variant="ghost" onClick={() => setSelection({ kind: "tile", x: nextMission.target.x, y: nextMission.target.y })}>Đi tới mục tiêu</Button>
          <Button density="compact" variant="secondary" disabled={action!.disabled} reason={action!.reason} onClick={() => void runCommand({ kind: "complete_campaign_mission", label: nextMission.kind === "combat" ? "Xuất quân chiến dịch" : "Hoàn tất nhiệm vụ", path: "/api/commands/campaign/complete", body: nextMission.kind === "combat" ? { missionId: nextMission.id, armyId: army?.id } : { missionId: nextMission.id } })}>{action!.label}</Button>
          <PendingChip kind="complete_campaign_mission" match={{ missionId: nextMission.id }} />
        </div>}
        {!nextMission && !campaignComplete && <p className="kom-meta">Đã hoàn tất phần đang mở. Hoàn tất các nhiệm vụ để mở chương tiếp.</p>}
        {campaignComplete && patrolMission && <div className="progression-next">
          <strong>Tuần tra PvE</strong>
          <span className="kom-meta">Lặp lại: {patrolMission.title} · thưởng XP theo chiến thắng, không nhận thưởng mở khóa lại. Thưởng tài nguyên mỗi trận thắng: {formatResources(gameRules.campaign.patrolRewards[patrolMission.chapter as 1 | 2 | 3], "—")}.</span>
          <Button density="compact" variant="secondary" disabled={!army} reason={!army ? "Cần một đạo quân v2." : undefined} onClick={() => void runCommand({ kind: "patrol_campaign", label: "Tuần tra PvE", path: "/api/commands/campaign/patrol", body: { missionId: patrolMission.id, armyId: army?.id } })}>Tuần tra</Button>
          <PendingChip kind="patrol_campaign" match={{ missionId: patrolMission.id }} />
        </div>}
      </section>
      <section>
        <strong>Nghiên cứu</strong>
        {/* The same dial the build rows wear: ring for the pace, seconds for
            the patience, one accessible sentence carrying both. */}
        {queue?.items[0] && (() => {
          const item = queue.items[0];
          const seconds = Math.max(0, Math.ceil((Date.parse(item.completesAt) - now) / 1000));
          return <div className="city-queue-meter">
            <ProgressMeter fraction={queueProgress(item.startedAt, item.completesAt, now)} icon="hourglass" size="sm" label={`Đang nghiên cứu ${technologyCatalog[item.technologyId].name}, còn ${seconds} giây`} />
            <p className="kom-meta">còn <span className="kom-num">{seconds}</span>s</p>
          </div>;
        })()}
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
