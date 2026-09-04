import { gameRules } from "@kingdoms/shared";
import type { OnboardingStep } from "@kingdoms/shared";
import { useGame } from "../state.js";
import { revealPanel, type PanelAnchorId } from "../panel-anchors.js";

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

export function OnboardingPanel() {
  const { state, runCommand } = useGame();
  const session = state.session!; const snapshot = state.snapshot!;
  const completed = new Set(snapshot.onboarding?.completedSteps ?? []);
  const stepsLeft = (Object.keys(stepMeta) as OnboardingStep[]).filter(step => !completed.has(step)).length;

  if (stepsLeft === 0) return <section className="onboarding-panel onboarding-done" aria-label="Nhiệm vụ giới thiệu"><h2>Nhiệm vụ giới thiệu</h2><p className="hint">Hoàn tất — chúc mừng, chủ nhân!</p></section>;

  return <section className="onboarding-panel" aria-label="Nhiệm vụ giới thiệu">
    <h2>Bắt đầu chiến lược gia</h2>
    <p className="hint">Đi từng bước để nắm cách chơi · còn {stepsLeft}/{Object.keys(stepMeta).length} bước</p>
    <ol className="onboarding-list">
      {(Object.keys(stepMeta) as OnboardingStep[]).map((step, index) => {
        const done = completed.has(step);
        return <li key={step} className={done ? "step-done" : ""}>
          <span className={done ? "step-check" : "step-dot"}>{done ? "✓" : index + 1}</span>
          <span className="step-label">{stepMeta[step].label}</span>
          {done ? <span className="hint">xong</span> : (
            <span className="step-actions">
              <button onClick={() => revealPanel(stepMeta[step].focus)}>Đi tới</button>
              {(step === "city_inspected" || step === "score_viewed") && (
                <button onClick={() => runCommand({ kind: "onboarding_ack", label: "Hoàn tất bước giới thiệu", path: "/api/commands/onboarding/ack", body: { step } }).catch(() => undefined)}>Hoàn tất bước</button>
              )}
            </span>
          )}
        </li>;
      })}
    </ol>
  </section>;
}