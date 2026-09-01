import { gameRules } from "@kingdoms/shared";
import type { OnboardingStep } from "@kingdoms/shared";
import * as api from "../api.js";
import { useGame } from "../state.js";

const stepMeta: Record<OnboardingStep, { label: string; focus: string }> = {
  city_inspected: { label: "Thăm quan thành phố", focus: ".city-panel" },
  depot_built: { label: "Xây trạm tiếp tế", focus: ".city-panel" },
  resource_harvested: { label: "Khai thác tài nguyên", focus: ".logistics-panel" },
  market_exported: { label: "Xuất khẩu hàng hóa", focus: ".logistics-panel" },
  barracks_built: { label: "Xây doanh trại", focus: ".city-panel" },
  army_recruited: { label: "Tuyển mộ quân đội", focus: ".army-panel" },
  raider_defeated: { label: "Đánh bại kẻ cướp", focus: ".hud" },
  score_viewed: { label: "Xem điểm mùa", focus: ".hud" },
};

export function OnboardingPanel() {
  const { state, addNotice } = useGame();
  const session = state.session!; const snapshot = state.snapshot!;
  const completed = new Set(snapshot.onboarding?.completedSteps ?? []);
  const stepsLeft = (Object.keys(stepMeta) as OnboardingStep[]).filter(step => !completed.has(step)).length;

  if (stepsLeft === 0) return <section className="onboarding-panel onboarding-done"><h2>Nhiệm vụ giới thiệu</h2><p className="hint">Hoàn tất — chúc mừng, chủ nhân!</p></section>;

  return <section className="onboarding-panel">
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
              <button onClick={() => document.querySelector<HTMLElement>(stepMeta[step].focus)?.scrollIntoView({ behavior: "smooth", block: "start" })}>Đi tới</button>
              {(step === "city_inspected" || step === "score_viewed") && (
                <button onClick={() => api.ackOnboarding(session.token, step).catch(e => addNotice(e.message))}>Hoàn tất bước</button>
              )}
            </span>
          )}
        </li>;
      })}
    </ol>
  </section>;
}