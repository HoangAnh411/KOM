import { campaignMissions, gameRules, onboardingSteps, technologyIds, troopTypes, type OnboardingStep, type WorldSnapshot } from "@kingdoms/shared";
import type { PendingCommand } from "./commands.js";
import type { MapSelection } from "./map-contract.js";
import type { PanelAnchorId } from "./panel-anchors.js";

export type NextActionCategory = "urgent" | "decision" | "onboarding" | "preparation" | "campaign" | "growth";
export type NextActionIntent =
  | { kind: "retry"; commandId: string }
  | { kind: "panel"; anchor: PanelAnchorId }
  | { kind: "select"; selection: MapSelection; anchor?: PanelAnchorId }
  | { kind: "enter-city"; cityId: string }
  | { kind: "profile" };

export type NextBestAction = {
  id: string;
  category: NextActionCategory;
  title: string;
  detail: string;
  cta: string;
  intent: NextActionIntent;
};

export const onboardingActionOrder: readonly OnboardingStep[] = onboardingSteps;
export const onboardingChapters: ReadonlyArray<{ id: string; title: string; steps: readonly OnboardingStep[] }> = [
  { id: "foundations", title: "Chương 1 · Nắm nền tảng", steps: ["city_inspected", "depot_built", "resource_harvested"] },
  { id: "readiness", title: "Chương 2 · Chuẩn bị lực lượng", steps: ["market_exported", "barracks_built", "army_recruited"] },
  { id: "command", title: "Chương 3 · Chỉ huy mùa", steps: ["raider_defeated", "score_viewed"] },
];

const onboardingCopy: Record<OnboardingStep, Omit<NextBestAction, "id" | "category" | "intent">> = {
  city_inspected: { title: "Khám phá nội thành", detail: "Mở nội thành để làm quen khu đất và công trình.", cta: "Xem nội thành" },
  depot_built: { title: "Nối tuyến tiếp tế", detail: "Xây Trạm tiếp tế để mở vận tải và giữ quân bền sức.", cta: "Tới công trình" },
  resource_harvested: { title: "Thu tài nguyên đầu tiên", detail: "Khai thác một điểm tài nguyên cho thành phố.", cta: "Tới vận tải" },
  market_exported: { title: "Mở đường giao thương", detail: "Đưa một chuyến hàng tới chợ trung tâm.", cta: "Tới vận tải" },
  barracks_built: { title: "Dựng Doanh trại", detail: "Xây Doanh trại để bắt đầu huấn luyện quân.", cta: "Tới công trình" },
  army_recruited: { title: "Lập đạo quân đầu tiên", detail: "Huấn luyện quân dự bị rồi giao cho một chỉ huy.", cta: "Tới quân đội" },
  raider_defeated: { title: "Đánh bại kẻ cướp", detail: "Chọn mục tiêu chiến dịch và giành chiến thắng đầu tiên.", cta: "Tới chiến dịch" },
  score_viewed: { title: "Đọc điểm mùa", detail: "Mở hồ sơ để xem điểm và tiến độ mùa của bạn.", cta: "Xem điểm mùa" },
};

const onboardingIntent = (step: OnboardingStep, snapshot: WorldSnapshot, playerId: string): NextActionIntent => {
  const city = snapshot.cities.find(item => item.playerId === playerId);
  if (step === "city_inspected" && city) return { kind: "enter-city", cityId: city.id };
  if (step === "score_viewed") return { kind: "profile" };
  if (step === "resource_harvested" || step === "market_exported") return { kind: "panel", anchor: "logistics" };
  if (step === "army_recruited") return { kind: "panel", anchor: "army" };
  if (step === "raider_defeated") return { kind: "panel", anchor: "progression" };
  return { kind: "panel", anchor: "city" };
};

/** Pure priority policy for the single recommendation shown in the kingdom UI. */
export function selectNextBestAction(snapshot: WorldSnapshot | undefined, pending: PendingCommand[], playerId: string): NextBestAction | undefined {
  const uncertain = pending.find(item => item.status === "uncertain");
  if (uncertain) return { id: `retry:${uncertain.commandId}`, category: "urgent", title: "Xác nhận lệnh còn treo", detail: `Máy chủ chưa xác nhận: ${uncertain.label}.`, cta: "Thử lại lệnh", intent: { kind: "retry", commandId: uncertain.commandId } };
  if (!snapshot) return undefined;

  const ownedArmies = snapshot.armies.filter(army => army.ownerPlayerId === playerId && army.strength > 0);
  const endangered = ownedArmies.filter(army => army.supply < gameRules.supply.attritionBelowSupply).sort((a, b) => a.supply - b.supply)[0];
  if (endangered) return { id: `supply-danger:${endangered.id}`, category: "urgent", title: "Cứu tuyến tiếp tế", detail: `Đạo quân ở ô ${endangered.x},${endangered.y} chỉ còn ${endangered.supply}% tiếp tế.`, cta: "Chọn đạo quân", intent: { kind: "select", selection: { kind: "army", id: endangered.id }, anchor: "army" } };

  const operation = snapshot.activeOperation;
  if (operation?.currentDecision) return { id: `operation:${operation.id}:${operation.currentDecision.id}`, category: "decision", title: "Chiến dịch đang chờ quyết định", detail: operation.currentDecision.options.map(option => option.label).join(" · "), cta: "Xem chiến dịch", intent: { kind: "panel", anchor: "progression" } };

  const treaty = (snapshot.treaties ?? []).find(item => item.status === "proposed" && item.targetPlayerId === playerId);
  if (treaty) return { id: `treaty:${treaty.id}`, category: "decision", title: "Phản hồi đề nghị ngoại giao", detail: "Một hiệp ước đang chờ quyết định của bạn.", cta: "Xem đề nghị", intent: { kind: "panel", anchor: "diplomacy" } };
  const alliance = (snapshot.alliances ?? []).find(item => item.members.some(member => member.playerId === playerId));
  const vote = (snapshot.allianceVotes ?? []).find(item => alliance && item.allianceId === alliance.id && item.status === "open" && !item.votes.some(cast => cast.playerId === playerId));
  if (vote) return { id: `vote:${vote.id}`, category: "decision", title: "Bỏ phiếu liên minh", detail: "Cuộc bầu lãnh đạo đang mở và bạn chưa bỏ phiếu.", cta: "Xem cuộc bỏ phiếu", intent: { kind: "panel", anchor: "alliance" } };

  const completed = new Set(snapshot.onboarding?.completedSteps ?? []);
  const onboarding = onboardingActionOrder.find(step => !completed.has(step));
  if (onboarding) return { id: `onboarding:${onboarding}`, category: "onboarding", ...onboardingCopy[onboarding], intent: onboardingIntent(onboarding, snapshot, playerId) };

  const city = snapshot.cities.find(item => item.playerId === playerId);
  const readyArmy = ownedArmies.find(item => item.composition);
  if (!readyArmy && city?.buildings.barracks) {
    const reserve = snapshot.troopReserves?.[city.id];
    const reserveTotal = reserve ? troopTypes.reduce((sum, type) => sum + reserve.available[type], 0) : 0;
    const freeCommander = (snapshot.commanders ?? []).some(item => item.ownerPlayerId === playerId && !item.assignedArmyId);
    const canCreate = reserveTotal >= 10 && freeCommander;
    return { id: canCreate ? "preparation:create" : "preparation:train", category: "preparation", title: canCreate ? "Lập đạo quân" : "Huấn luyện quân dự bị", detail: canCreate ? "Quân và chỉ huy đã sẵn sàng để lập đạo quân." : "Bổ sung ít nhất 10 quân dự bị trước khi xuất quân.", cta: canCreate ? "Lập đạo quân" : "Tới Doanh trại", intent: { kind: "panel", anchor: "army" } };
  }
  const lowSupply = ownedArmies.filter(army => army.supply < 50).sort((a, b) => a.supply - b.supply)[0];
  if (lowSupply) return { id: `supply-prepare:${lowSupply.id}`, category: "preparation", title: "Chuẩn bị tiếp tế", detail: `Đạo quân còn ${lowSupply.supply}% tiếp tế; nên củng cố trước chiến dịch.`, cta: "Chọn đạo quân", intent: { kind: "select", selection: { kind: "army", id: lowSupply.id }, anchor: "army" } };

  const progress = snapshot.campaignProgress?.[playerId];
  const completedMissions = new Set(progress?.completedMissionIds ?? []);
  const unlockedChapter = progress?.unlockedChapter ?? 1;
  const mission = campaignMissions.find(item => item.chapter <= unlockedChapter && !completedMissions.has(item.id));
  if (mission) return { id: `campaign:${mission.id}`, category: "campaign", title: mission.title, detail: mission.description, cta: "Chọn mục tiêu", intent: { kind: "select", selection: { kind: "tile", x: mission.target.x, y: mission.target.y }, anchor: "progression" } };

  const unlocked = snapshot.technologyProgress?.[playerId]?.unlocked ?? [];
  const researchBusy = Boolean(snapshot.researchQueues?.[playerId]?.items.length);
  if (city?.buildings.academy && !researchBusy && unlocked.length < technologyIds.length) return { id: "growth:research", category: "growth", title: "Chọn nghiên cứu mới", detail: "Học viện đang rảnh và có công nghệ chưa mở.", cta: "Tới nghiên cứu", intent: { kind: "panel", anchor: "progression" } };
  return { id: "growth:build", category: "growth", title: "Phát triển thành phố", detail: "Nâng công trình để mở thêm năng lực kinh tế và quân sự.", cta: "Tới công trình", intent: { kind: "panel", anchor: "city" } };
}
