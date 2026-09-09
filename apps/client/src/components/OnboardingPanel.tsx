import { useState } from "react";
import type { OnboardingStep } from "@kingdoms/shared";
import { useGame } from "../state.js";
import { revealPanel, type PanelAnchorId } from "../panel-anchors.js";
import { onboardingChapters, selectNextBestAction, type NextActionIntent } from "../next-action.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";
import { Panel, PanelBody, PanelHeader } from "../ui/Panel.js";
import { PendingChip } from "./PendingChip.js";
import { PlayerHubModal } from "./PlayerHubModal.js";

const stepMeta: Record<OnboardingStep, { label: string }> = {
  city_inspected: { label: "Thăm quan thành phố" },
  depot_built: { label: "Xây trạm tiếp tế" },
  resource_harvested: { label: "Khai thác tài nguyên" },
  market_exported: { label: "Xuất khẩu hàng hóa" },
  barracks_built: { label: "Xây doanh trại" },
  army_recruited: { label: "Tuyển mộ quân đội" },
  raider_defeated: { label: "Đánh bại kẻ cướp" },
  score_viewed: { label: "Xem điểm mùa" },
};

const steps = Object.keys(stepMeta) as OnboardingStep[];

/** Three presentation chapters over the unchanged durable step ids, plus one
 * recommendation chosen by the pure policy. Rows report progress; only the
 * recommendation is a primary action, so the panel never becomes a dashboard. */
export function OnboardingPanel() {
  const {
    state, pending, retryPending, runCommand, setSelection, openCityInterior,
    setActivePanel, setAdvancedOpen,
  } = useGame();
  const [profileOpen, setProfileOpen] = useState(false);
  const snapshot = state.snapshot!;
  const playerId = state.session!.player.id;
  const completed = new Set(snapshot.onboarding?.completedSteps ?? []);
  const stepsLeft = steps.filter(step => !completed.has(step)).length;
  const next = selectNextBestAction(snapshot, pending, playerId);

  const jump = (anchor: PanelAnchorId) => {
    if (anchor === "city" || anchor === "army" || anchor === "logistics" || anchor === "diplomacy") setActivePanel(anchor);
    if (anchor === "alliance" || anchor === "events" || anchor === "diplomacy") setAdvancedOpen(true);
    setTimeout(() => revealPanel(anchor), 60);
  };
  const act = (intent: NextActionIntent) => {
    switch (intent.kind) {
      case "retry": return retryPending(intent.commandId);
      case "panel": return jump(intent.anchor);
      case "select": setSelection(intent.selection); if (intent.anchor) jump(intent.anchor); return;
      case "enter-city": setSelection({ kind: "city", id: intent.cityId }); openCityInterior(intent.cityId); return;
      case "profile": setProfileOpen(true); return;
    }
  };
  const skip = (step: "city_inspected" | "score_viewed") => void runCommand({
    kind: "onboarding_ack", label: "Bỏ qua bước giới thiệu", path: "/api/commands/onboarding/ack", body: { step },
  }).catch(() => undefined);

  return <>
    <Panel accent={stepsLeft === 0 ? "teal" : "brass"} aria-label="Nhiệm vụ giới thiệu">
      <PanelHeader title={stepsLeft === 0 ? <><Icon name="check" size="sm" /> Đã nắm nền tảng</> : "Bắt đầu chiến lược gia"} />
      <PanelBody>
        <p className="kom-meta">{stepsLeft === 0 ? "Các bước giới thiệu đã hoàn tất." : <>Đi từng chương để nắm cách chơi · còn <span className="kom-num">{stepsLeft}/{steps.length}</span> bước</>}</p>
        {next && <div role="group" aria-label="Hành động nên làm tiếp">
          <strong>{next.title}</strong>
          <p className="kom-meta">{next.detail}</p>
          <Button variant="primary" block onClick={() => act(next.intent)}>{next.cta}</Button>
        </div>}
        {onboardingChapters.map(chapter => <div role="group" key={chapter.id} aria-labelledby={`onboarding-${chapter.id}`}>
          <strong id={`onboarding-${chapter.id}`}>{chapter.title}</strong>
          <ol className="onboarding-list">
            {chapter.steps.map(step => {
              const done = completed.has(step);
              const index = steps.indexOf(step);
              return <li key={step} className={done ? "step-done" : ""}>
                <span className={done ? "step-check" : "step-dot"}>{done ? "✓" : index + 1}</span>
                <span className="step-label">{stepMeta[step].label}</span>
                {done ? <span className="kom-meta">xong</span> : (step === "city_inspected" || step === "score_viewed") ? <span className="step-actions">
                  <Button variant="ghost" density="compact" onClick={() => skip(step)}>Bỏ qua bước này</Button>
                  <PendingChip kind="onboarding_ack" match={{ step }} />
                </span> : null}
              </li>;
            })}
          </ol>
        </div>)}
      </PanelBody>
    </Panel>
    {profileOpen && <PlayerHubModal mode="profile" onClose={() => setProfileOpen(false)} />}
  </>;
}
