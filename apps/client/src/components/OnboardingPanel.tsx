import type { OnboardingStep } from "@kingdoms/shared";
import { useGame } from "../state.js";
import { revealPanel, type PanelAnchorId } from "../panel-anchors.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";
import { Panel, PanelBody, PanelHeader } from "../ui/Panel.js";
import { PendingChip } from "./PendingChip.js";

const stepMeta: Record<OnboardingStep, { label: string; focus: PanelAnchorId }> = {
  city_inspected: { label: "Thăm quan thành phố", focus: "city" },
  depot_built: { label: "Xây trạm tiếp tế", focus: "city" },
  resource_harvested: { label: "Khai thác tài nguyên", focus: "logistics" },
  market_exported: { label: "Xuất khẩu hàng hóa", focus: "logistics" },
  barracks_built: { label: "Xây doanh trại", focus: "city" },
  army_recruited: { label: "Tuyển mộ quân đội", focus: "army" },
  raider_defeated: { label: "Đánh bại kẻ cướp", focus: "hud" },
  score_viewed: { label: "Xem điểm mùa", focus: "hud" },
};

const steps = Object.keys(stepMeta) as OnboardingStep[];

/** The checklist a new player is handed. Two of the eight steps are ones only the
 *  player can attest to — they looked at their city, they read the score — so
 *  those carry an acknowledge button; the rest tick themselves when the server
 *  sees the deed. The accent is the tell: brass while there is work left, teal
 *  once the list is done, which is the same "succeeded" hue the status chips use. */
export function OnboardingPanel() {
  const { state, runCommand } = useGame();
  const snapshot = state.snapshot!;
  const completed = new Set(snapshot.onboarding?.completedSteps ?? []);
  const stepsLeft = steps.filter(step => !completed.has(step)).length;

  if (stepsLeft === 0) return <Panel accent="teal" aria-label="Nhiệm vụ giới thiệu">
    <PanelHeader title={<><Icon name="check" size="sm" /> Nhiệm vụ giới thiệu</>} />
    <PanelBody><p className="kom-meta">Hoàn tất — chúc mừng, chủ nhân!</p></PanelBody>
  </Panel>;

  return <Panel accent="brass" aria-label="Nhiệm vụ giới thiệu">
    <PanelHeader title="Bắt đầu chiến lược gia" />
    <PanelBody>
      <p className="kom-meta">Đi từng bước để nắm cách chơi · còn <span className="kom-num">{stepsLeft}/{steps.length}</span> bước</p>
      <ol className="onboarding-list">
        {steps.map((step, index) => {
          const done = completed.has(step);
          return <li key={step} className={done ? "step-done" : ""}>
            <span className={done ? "step-check" : "step-dot"}>{done ? "✓" : index + 1}</span>
            <span className="step-label">{stepMeta[step].label}</span>
            {done ? <span className="kom-meta">xong</span> : (
              <span className="step-actions">
                <Button variant="ghost" density="compact" onClick={() => revealPanel(stepMeta[step].focus)}>Đi tới</Button>
                {(step === "city_inspected" || step === "score_viewed") && <>
                  <Button variant="secondary" density="compact" onClick={() => runCommand({ kind: "onboarding_ack", label: "Hoàn tất bước giới thiệu", path: "/api/commands/onboarding/ack", body: { step } }).catch(() => undefined)}>Hoàn tất bước</Button>
                  <PendingChip kind="onboarding_ack" match={{ step }} />
                </>}
              </span>
            )}
          </li>;
        })}
      </ol>
    </PanelBody>
  </Panel>;
}
