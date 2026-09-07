import { useMemo, useState } from "react";
import { armyCompositionTotal, commanderCapacity, gameRules, troopTypes, type Army, type ArmyComposition, type ArmyPosition, type BattleStance, type TroopType } from "@kingdoms/shared";
import { useGame } from "../state.js";
import { Button } from "../ui/Button.js";
import { Panel, PanelBody, PanelHeader } from "../ui/Panel.js";
import { PendingChip } from "./PendingChip.js";

const positionLabels: Record<ArmyPosition, string> = { frontline: "Tiền tuyến", backline: "Hậu tuyến", flank: "Cánh" };
const troopLabels: Record<TroopType, string> = { shield_infantry: "Bộ binh khiên", spearmen: "Giáo binh", archers: "Cung thủ", cavalry: "Kỵ binh" };
const stanceLabels: Record<BattleStance, string> = { balanced: "Cân bằng", raid: "Đột kích", defensive: "Phòng thủ" };
const emptyComposition = (): ArmyComposition => ({ frontline: null, backline: null, flank: null });

function draftOf(army: Army): ArmyComposition {
  return army.composition ?? emptyComposition();
}

function updateSlot(composition: ArmyComposition, position: ArmyPosition, troopType: TroopType, count: number): ArmyComposition {
  return { ...composition, [position]: count > 0 ? { id: `${position}-${troopType}`, troopType, position, count } : null };
}

function troopCount(composition: ArmyComposition, troopType: TroopType): number {
  return (Object.keys(positionLabels) as ArmyPosition[]).reduce((total, position) => total + (composition[position]?.troopType === troopType ? composition[position]!.count : 0), 0);
}

export function ArmyPreparationPanel() {
  const { state, runCommand } = useGame();
  const snapshot = state.snapshot;
  const playerId = state.session?.player.id;
  const city = snapshot?.cities.find(item => item.playerId === playerId);
  const armies = useMemo(() => snapshot?.armies.filter(item => item.ownerPlayerId === playerId && item.composition) ?? [], [snapshot, playerId]);
  const [drafts, setDrafts] = useState<Record<string, ArmyComposition>>({});
  const [presetNames, setPresetNames] = useState<Record<string, string>>({});
  const [selectedPresets, setSelectedPresets] = useState<Record<string, string>>({});
  const [createTroopType, setCreateTroopType] = useState<TroopType>("shield_infantry");
  const [createAmount, setCreateAmount] = useState(10);
  if (!snapshot || !city || !playerId) return null;
  const commanders = snapshot.commanders?.filter(item => item.ownerPlayerId === playerId) ?? [];
  const reserve = snapshot.troopReserves?.[city.id];
  const training = snapshot.trainingQueues?.[city.id];
  const hospital = snapshot.hospitalQueues?.[city.id];
  const presets = snapshot.formationPresets ?? [];

  const setDraft = (army: Army, composition: ArmyComposition) => setDrafts(current => ({ ...current, [army.id]: composition }));
  const saveComposition = (army: Army, composition: ArmyComposition) => {
    void runCommand({ kind: "update_army_composition", label: "Lưu bố trí quân", path: "/api/commands/army/composition", body: { armyId: army.id, composition, stance: army.stance ?? "balanced" } });
  };
  const queueTraining = (troopType: TroopType) => void runCommand({ kind: "train_troops", label: "Huấn luyện quân", path: "/api/commands/train", body: { cityId: city.id, troopType, amount: 10 } });
  const savePreset = (army: Army, composition: ArmyComposition) => {
    const name = (presetNames[army.id] ?? "").trim();
    if (!name) return;
    void runCommand({ kind: "save_formation_preset", label: "Lưu mẫu đội hình", path: "/api/commands/formation-presets", body: { name, composition, stance: army.stance ?? "balanced" } });
  };
  const freeCommander = commanders.find(item => !item.assignedArmyId);
  const createCapacity = freeCommander ? commanderCapacity(freeCommander.level) : 0;
  const createAvailable = reserve?.available[createTroopType] ?? 0;
  const canCreateArmy = Boolean(freeCommander && createAvailable >= createAmount && createAmount >= 10 && createAmount <= createCapacity);
  const createReason = !freeCommander ? "Không còn chỉ huy trống." : createAmount > createCapacity ? "Vượt sức chứa chỉ huy." : createAvailable < createAmount ? "Dự bị không đủ quân." : undefined;

  return <Panel accent="crimson" className="army-preparation-panel" aria-label="Chuẩn bị quân">
    <PanelHeader title="Chuẩn bị quân" />
    <PanelBody>
      <p className="kom-meta">Quân dự bị tại thành: {reserve ? troopTypes.map(type => `${troopLabels[type]} ${reserve.available[type]}`).join(" · ") : "chưa có dữ liệu"}</p>
      <section className="army-preparation-card">
        <strong>Tuyển và lập đạo quân</strong>
        <p className="kom-meta">Tuyển vào dự bị qua hàng đợi ở Doanh trại bên dưới, sau đó chọn chỉ huy để tạo đạo quân.</p>
        {freeCommander && <div className="army-preparation-actions">
          <label>Chỉ huy <select value={freeCommander.id} disabled><option value={freeCommander.id}>{freeCommander.name} · cấp {freeCommander.level}</option></select></label>
          <label>Loại quân <select value={createTroopType} onChange={event => setCreateTroopType(event.target.value as TroopType)}>{troopTypes.map(type => <option key={type} value={type}>{troopLabels[type]}</option>)}</select></label>
          <label>Số lượng <input type="number" min={10} max={createCapacity || 500} step={10} value={createAmount} onChange={event => setCreateAmount(Math.max(10, Number(event.target.value) || 10))} /></label>
          <Button density="compact" variant="secondary" disabled={!canCreateArmy} reason={createReason} onClick={() => void runCommand({ kind: "create_army", label: "Lập đạo quân", path: "/api/commands/army/create", body: { cityId: city.id, commanderId: freeCommander.id, composition: { frontline: { id: `frontline-${Date.now()}`, troopType: createTroopType, position: "frontline", count: createAmount }, backline: null, flank: null }, stance: "balanced" }})}>Lập đạo quân</Button>
        </div>}
        <PendingChip kind="train_troops" match={{ cityId: city.id }} />
        <PendingChip kind="create_army" match={{ cityId: city.id }} />
      </section>
      {armies.map(army => {
        const commander = commanders.find(item => item.id === army.commanderId);
        const composition = drafts[army.id] ?? draftOf(army);
        const total = armyCompositionTotal(composition);
        const capacity = commander ? commanderCapacity(commander.level) : 0;
        return <section className="army-preparation-card" key={army.id}>
          <div className="army-preparation-heading">
            <strong>Đạo quân {army.id.slice(0, 8)}</strong>
            <span className="kom-meta">{total}/{capacity || "?"} lính · Nhuệ khí {army.morale} · Tiếp tế {army.supply}%</span>
          </div>
          <p className="kom-meta">Chỉ huy: {commander?.name ?? "Chưa chọn"} · cấp {commander?.level ?? "?"} · XP {commander?.xp ?? 0}/{commander ? commander.level * 100 : "?"}</p>
          <p className="kom-meta">Quân: {troopTypes.map(type => `${troopLabels[type]} ${troopCount(composition, type)}`).join(" · ")}</p>
          <label>Chỉ huy
            <select value={army.commanderId ?? ""} onChange={event => void runCommand({ kind: "assign_commander", label: "Đổi chỉ huy", path: "/api/commands/army/commander", body: { armyId: army.id, commanderId: event.target.value } })}>
              <option value="">Chưa chọn</option>
              {commanders.map(item => <option key={item.id} value={item.id}>{item.name} · {item.specialty} · cấp {item.level}</option>)}
            </select>
          </label>
          <div className="army-preparation-slots">
            {(Object.keys(positionLabels) as ArmyPosition[]).map(position => {
              const squad = composition[position];
              const type = squad?.troopType ?? "shield_infantry";
              return <div className="army-preparation-slot" key={position}>
                <strong>{positionLabels[position]}</strong>
                <select value={type} onChange={event => setDraft(army, updateSlot(composition, position, event.target.value as TroopType, squad?.count ?? 0))}>
                  {troopTypes.map(item => <option value={item} key={item}>{troopLabels[item]}</option>)}
                </select>
                <input type="number" min={0} max={capacity || 500} value={squad?.count ?? 0} aria-label={`${positionLabels[position]} số lượng`} onChange={event => setDraft(army, updateSlot(composition, position, type, Math.max(0, Number(event.target.value) || 0)))} />
              </div>;
            })}
          </div>
          <div className="army-preparation-actions">
            <label>Thế trận <select value={army.stance ?? "balanced"} onChange={event => void runCommand({ kind: "update_army_composition", label: "Đổi thế trận", path: "/api/commands/army/composition", body: { armyId: army.id, composition, stance: event.target.value } })}>{(Object.keys(stanceLabels) as BattleStance[]).map(item => <option key={item} value={item}>{stanceLabels[item]}</option>)}</select></label>
            {(army.x !== city.x || army.y !== city.y || army.returningHome) && <Button density="compact" variant="ghost" onClick={() => void runCommand({ kind: "return_army_home", label: "Về thành", path: "/api/commands/army/return-home", body: { armyId: army.id } })}>Về thành</Button>}
            <Button density="compact" variant="secondary" disabled={!commander || total > capacity || !composition.frontline} reason={!commander ? "Cần chỉ huy trước khi lưu." : !composition.frontline ? "Đạo quân phải có tiền tuyến." : total > capacity ? "Vượt sức chứa chỉ huy." : undefined} onClick={() => saveComposition(army, composition)}>Lưu bố trí</Button>
            <PendingChip kind="update_army_composition" match={{ armyId: army.id }} />
          </div>
          <div className="army-preparation-actions">
            <label>Mẫu đội hình
              <select aria-label={`Mẫu đội hình ${army.id.slice(0, 8)}`} value={selectedPresets[army.id] ?? ""} onChange={event => setSelectedPresets(current => ({ ...current, [army.id]: event.target.value }))}>
                <option value="">Chọn mẫu</option>
                {presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
              </select>
            </label>
            <Button density="compact" variant="ghost" disabled={!selectedPresets[army.id]} reason={!selectedPresets[army.id] ? "Chọn một mẫu trước khi áp dụng." : undefined} onClick={() => void runCommand({ kind: "apply_formation_preset", label: "Áp dụng mẫu đội hình", path: "/api/commands/formation-presets/apply", body: { armyId: army.id, presetId: selectedPresets[army.id] } })}>Áp dụng mẫu</Button>
            <label>Tên mẫu
              <input value={presetNames[army.id] ?? ""} maxLength={40} placeholder="Ví dụ: Cung thủ phòng thủ" onChange={event => setPresetNames(current => ({ ...current, [army.id]: event.target.value }))} />
            </label>
            <Button density="compact" variant="ghost" disabled={!presetNames[army.id]?.trim() || presets.length >= 5} reason={presets.length >= 5 ? "Đã đạt tối đa 5 mẫu đội hình." : !presetNames[army.id]?.trim() ? "Nhập tên mẫu trước khi lưu." : undefined} onClick={() => savePreset(army, composition)}>Lưu mẫu</Button>
            <PendingChip kind="save_formation_preset" />
            <PendingChip kind="apply_formation_preset" match={{ armyId: army.id }} />
          </div>
          <p className="kom-meta">Thương binh: {troopTypes.map(type => `${troopLabels[type]} ${army.wounded?.[type] ?? 0}`).join(" · ")}</p>
          <p className="kom-meta">Buff: {commander?.specialty === "archer" ? "Cung thủ +10% sát thương; hiệp 3 +20%." : commander?.specialty === "cavalry" ? "Kỵ binh +10% sát thương; hiệp 1 cánh +20%." : commander?.specialty === "infantry" ? "Bộ binh khiên/giáo giảm 10% sát thương; 2 hiệp đầu tiền tuyến giảm 10%." : commander ? "Giảm 15% tiêu hao tiếp tế; đầu hiệp 3 hồi 10 nhuệ khí." : "Chưa có chỉ huy."}</p>
        </section>;
      })}
      {armies.length === 0 && <p className="kom-meta">Chưa có đạo quân v2. Tuyển quân vào dự bị rồi lập đạo quân.</p>}
      <div className="army-preparation-queues">
        <strong>Doanh trại</strong> <span className="kom-meta">Hàng đợi {training?.items.length ?? 0}/{gameRules.training.queueLimit}</span>
        <div>{troopTypes.map(type => <Button key={type} density="compact" variant="ghost" disabled={!city.buildings.barracks || (training?.items.length ?? 0) >= gameRules.training.queueLimit} reason={!city.buildings.barracks ? "Cần xây Doanh trại." : (training?.items.length ?? 0) >= gameRules.training.queueLimit ? "Hàng đợi huấn luyện đang đầy." : undefined} onClick={() => queueTraining(type)}>+10 {troopLabels[type]}</Button>)}</div>
        <PendingChip kind="train_troops" match={{ cityId: city.id }} />
        <strong>Quân y viện</strong> <span className="kom-meta">Hàng đợi {hospital?.items.length ?? 0}/{gameRules.training.queueLimit}</span>
        <div>{troopTypes.filter(type => (reserve?.wounded[type] ?? 0) > 0).map(type => <Button key={type} density="compact" variant="ghost" disabled={!city.buildings.hospital || (hospital?.items.length ?? 0) >= gameRules.training.queueLimit} reason={!city.buildings.hospital ? "Cần xây Quân y viện." : (hospital?.items.length ?? 0) >= gameRules.training.queueLimit ? "Hàng đợi quân y đang đầy." : undefined} onClick={() => void runCommand({ kind: "heal_troops", label: "Chữa thương", path: "/api/commands/heal", body: { cityId: city.id, troopType: type, amount: Math.min(10, reserve?.wounded[type] ?? 0) } })}>Chữa 10 {troopLabels[type]}</Button>)}</div>
        <PendingChip kind="heal_troops" match={{ cityId: city.id }} />
      </div>
    </PanelBody>
  </Panel>;
}
