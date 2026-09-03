import { useState } from "react";
import { gameRules, recruitmentCost } from "@kingdoms/shared";
import type { Army } from "@kingdoms/shared";
import { useGame } from "../state.js";
import { usePanelAnchor } from "../panel-anchors.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";
import { Modal } from "../ui/Modal.js";
import { Panel, PanelBody, PanelFooter, PanelHeader } from "../ui/Panel.js";
import { affordable, firstReason, hasOrder, notFrozen } from "../validation.js";
import { armyLabel, formatCost, formationLabels, npcLabels } from "../vocabulary.js";
import { PendingChip } from "./PendingChip.js";

type RecruitUnitId = keyof typeof gameRules.recruitment;

export function ArmyPanel() {
  const { state, runCommand, selection, setSelection } = useGame();
  const session = state.session!; const snapshot = state.snapshot!;
  const city = snapshot.cities.find(item => item.playerId === session.player.id) ?? snapshot.cities[0];
  const [modal, setModal] = useState<null | { kind: "recruit" } | { kind: "attack"; armyId: string }>(null);
  const [count, setCount] = useState(10);
  const [targetId, setTargetId] = useState("");
  const [recruitUnit, setRecruitUnit] = useState<RecruitUnitId>("infantry");

  const myArmies = snapshot.armies.filter(army => army.ownerPlayerId === session.player.id && army.strength > 0);
  const enemyArmies = snapshot.armies.filter(army => army.ownerPlayerId !== session.player.id && army.strength > 0 && !army.frozen);
  const hasBarracks = (city.buildings.barracks ?? 0) >= 1;
  const unitCost = recruitmentCost(recruitUnit, count);
  // One affordability rule for the whole client (`validation.affordable`), so the
  // recruit gate and the build gate cannot disagree about what "đủ" means.
  const costCheck = affordable(city, unitCost);
  /** Whose army it is. The NPC branch used to fall through to `army.npcKind`,
   *  which put the raw `raider` in front of the player. */
  const targetName = (army: Army) => army.ownerPlayerId
    ? (snapshot.cities.find(item => item.playerId === army.ownerPlayerId)?.playerName ?? "?")
    : army.npcKind ? npcLabels[army.npcKind] : "NPC";
  const anchor = usePanelAnchor<HTMLElement>("army");

  // The label used to carry the requirement — "Tuyển quân (cần Doanh trại)" — so
  // the control renamed itself depending on the city. One name, and the reason
  // says what is missing: a button whose text changes is a different button to
  // anyone reading the screen a second time.
  const recruitBlocked = firstReason(notFrozen(city), { ok: hasBarracks, reason: "Cần xây Doanh trại trước khi tuyển quân." });
  const attackBlocked = firstReason(notFrozen(city), { ok: enemyArmies.length > 0, reason: "Chưa thấy đối thủ nào trong tầm." });

  return <Panel accent="crimson" className="army-panel" panelRef={anchor} aria-label="Quân đội">
    <PanelHeader title={<><Icon name="sword" size="sm" /> Quân đội</>} />
    <PanelBody>
      <p className="kom-meta">Tiếp tế rút xuống dưới {gameRules.supply.attritionBelowSupply}% gây hao mòn (mất sức mạnh & nhuệ khí). Quân đứng gần thành phố (bán kính {gameRules.supply.insideCityRadius}) hoặc trạm tiếp tế hồi phục tiếp tế.</p>
      {myArmies.length === 0 && <p className="kom-meta">Bạn chưa có quân đội. Xây Doanh trại rồi tuyển mộ.</p>}
      {myArmies.map(army => {
        const target = army.attackOrder ? snapshot.armies.find(item => item.id === army.attackOrder!.targetArmyId) : undefined;
        const cancelBlocked = firstReason(notFrozen(city), { ok: hasOrder(army), reason: "Quân này chưa có lệnh nào để hủy." });
        // The other half of the map's cross-highlight: clicking an army on the map
        // brings the nav here, so the row it brought the player to has to be the
        // one that stands out. `aria-current` rather than a class, because that is
        // the attribute the column's nav already uses for "you are here".
        const picked = selection?.kind === "army" && selection.id === army.id;
        return <div className="army-row" data-testid="army-row" key={army.id} aria-current={picked ? "true" : undefined}>
          <div className="army-title">
            <strong>{armyLabel(army)} · {army.strength}</strong>
            <span className="kom-meta">{army.attackOrder ? `Đang tấn công ${target ? targetName(target) : "?"}` : army.targetX !== undefined ? `Di chuyển đến (${army.targetX},${army.targetY})` : "Chờ lệnh"}</span>
          </div>
          {/* Was four glyphs with tooltip-only meanings (⚔ ★ ⛽ and a bare pair of
              coordinates). A tooltip is not a label on a touch screen and not a
              label to a screen reader, and the strength was already in the title
              above, so the row says three things in words instead of four in
              symbols. */}
          <p className="army-stats kom-meta">
            <span>Nhuệ khí <span className="kom-num">{army.morale}</span></span>
            <span className={army.supply < gameRules.supply.attritionBelowSupply ? "low-supply" : ""}>Tiếp tế <span className="kom-num">{army.supply}</span>%</span>
            <span>Vị trí ({army.x},{army.y})</span>
          </p>
          <div className="army-actions">
            {/* One spelling per order. The picker said "Vuông" — the shape — while
                the battle report said "phòng ngự" — what it does — for the same
                formation, so `vocabulary.ts` owns the three words now and both
                surfaces read them from there. */}
            <select title="Đội hình" aria-label="Đội hình" value={army.formation} onChange={event => runCommand({ kind: "set_formation", label: "Đổi đội hình", path: "/api/commands/formation", body: { armyId: army.id, formation: event.target.value } }).catch(() => undefined)}>
              {Object.entries(formationLabels).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
            </select>
            <Button
              variant="ghost"
              density="compact"
              onClick={() => setSelection({ kind: "army", id: army.id })}
            >Xem trên bản đồ</Button>
            <Button
              variant="ghost"
              density="compact"
              disabled={Boolean(cancelBlocked)}
              reason={cancelBlocked}
              onClick={() => runCommand({ kind: "cancel_army_order", label: "Hủy lệnh", path: "/api/commands/cancel-army-order", body: { armyId: army.id } }).catch(() => undefined)}
            >Hủy lệnh</Button>
            <Button
              density="compact"
              disabled={Boolean(attackBlocked)}
              reason={attackBlocked}
              onClick={() => { setTargetId(""); setModal({ kind: "attack", armyId: army.id }); }}
            >{army.attackOrder ? "Đổi mục tiêu" : "Tấn công"}</Button>
            <PendingChip kind="attack" match={{ armyId: army.id }} />
            <PendingChip kind="cancel_army_order" match={{ armyId: army.id }} />
            <PendingChip kind="set_formation" match={{ armyId: army.id }} />
          </div>
        </div>;
      })}
    </PanelBody>
    <PanelFooter>
      <Button
        variant="primary"
        disabled={Boolean(recruitBlocked)}
        reason={recruitBlocked}
        onClick={() => { setCount(10); setRecruitUnit("infantry"); setModal({ kind: "recruit" }); }}
      >Tuyển quân mới</Button>
      <PendingChip kind="recruit" match={{ cityId: city.id }} />
    </PanelFooter>

    {modal?.kind === "recruit" && (
      <Modal title="Tuyển quân" onClose={() => setModal(null)} actions={<>
        <Button variant="ghost" onClick={() => setModal(null)}>Hủy</Button>
        <Button
          variant="primary"
          disabled={Boolean(firstReason(notFrozen(city), costCheck))}
          reason={firstReason(notFrozen(city), costCheck)}
          onClick={() => runCommand({ kind: "recruit", label: "Tuyển quân", path: "/api/commands/recruit", body: { cityId: city.id, unitType: recruitUnit, amount: count } }).then(() => setModal(null)).catch(() => undefined)}
        >Tuyển {count} {gameRules.recruitment[recruitUnit].name}</Button>
      </>}>
        {(["infantry", "cavalry", "archer"] as RecruitUnitId[]).map(id => (
          <label key={id} className="modal-choice">
            <input type="radio" name="recruit-unit" checked={recruitUnit === id} onChange={() => setRecruitUnit(id)} />
            <span><strong>{gameRules.recruitment[id].name}</strong> · {gameRules.recruitment[id].description}</span>
          </label>
        ))}
        <p className="kom-meta">Số lượng: <span className="kom-num">{count}</span></p>
        <input type="range" min={gameRules.army.recruitAmountMin} max={gameRules.army.recruitAmountMax} step={gameRules.army.recruitAmountStep} value={count} onChange={event => setCount(Number(event.target.value))} aria-label="Số lượng" />
        <p className="kom-meta">Chi phí: {formatCost(unitCost)}</p>
      </Modal>
    )}

    {modal?.kind === "attack" && (
      <Modal title="Tấn công" onClose={() => setModal(null)} actions={<>
        <Button variant="ghost" onClick={() => setModal(null)}>Hủy</Button>
        <Button
          variant="destructive"
          disabled={Boolean(firstReason(notFrozen(city), { ok: Boolean(targetId), reason: "Chọn mục tiêu trước." }))}
          reason={firstReason(notFrozen(city), { ok: Boolean(targetId), reason: "Chọn mục tiêu trước." })}
          onClick={() => runCommand({ kind: "attack", label: "Ra lệnh tấn công", path: "/api/commands/attack", body: { armyId: modal.armyId, targetArmyId: targetId } }).then(() => setModal(null)).catch(() => undefined)}
        >Ra lệnh tấn công</Button>
      </>}>
        <p className="kom-meta">Chọn mục tiêu gần nhất. Quân đội sẽ truy đuổi mục tiêu đang chạy; lệnh có thể bị hủy bất kỳ lúc nào.</p>
        <select value={targetId} onChange={event => setTargetId(event.target.value)} aria-label="Mục tiêu tấn công">
          <option value="">Chọn mục tiêu…</option>
          {enemyArmies
            .map(target => ({ target, distance: Math.abs(target.x - city.x) + Math.abs(target.y - city.y) }))
            .sort((a, b) => a.distance - b.distance)
            .map(({ target, distance }) => (
              <option value={target.id} key={target.id}>{targetName(target)} · {armyLabel(target)} · {target.strength} ({distance} ô)</option>
            ))}
        </select>
      </Modal>
    )}
  </Panel>;
}
