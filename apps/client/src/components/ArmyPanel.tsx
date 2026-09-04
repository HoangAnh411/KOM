import { useState } from "react";
import { gameRules, recruitmentCost } from "@kingdoms/shared";
import type { Army, UnitType } from "@kingdoms/shared";
import { useGame } from "../state.js";
import { usePanelAnchor } from "../panel-anchors.js";

type RecruitUnitId = keyof typeof gameRules.recruitment;

export function ArmyPanel() {
  const { state, runCommand } = useGame();
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
  const canAfford = city.resources.wood >= unitCost.wood && city.resources.stone >= unitCost.stone && city.resources.iron >= unitCost.iron;
  const targetName = (army: Army) => army.ownerPlayerId ? (snapshot.cities.find(item => item.playerId === army.ownerPlayerId)?.playerName ?? "?") : army.npcKind ?? "NPC";
  const anchor = usePanelAnchor<HTMLElement>("army");

  return <section ref={anchor} className="army-panel" aria-label="Quân đội">
    <h2>Quân đội</h2>
    <p className="hint">Tiếp tế rút xuống dưới {gameRules.supply.attritionBelowSupply}% gây hao mòn (mất sức mạnh & nhuệ khí). Quân đứng gần thành phố (bán kính {gameRules.supply.insideCityRadius}) hoặc trạm tiếp tế hồi phục tiếp tế.</p>
    {myArmies.length === 0 && <p className="hint">Bạn chưa có quân đội. Xây Doanh trại rồi tuyển mộ.</p>}
    {myArmies.map(army => {
      const target = army.attackOrder ? snapshot.armies.find(item => item.id === army.attackOrder!.targetArmyId) : undefined;
      return <div className="army-row" data-testid="army-row" key={army.id}>
        <div className="army-title">
          <strong>{gameRules.recruitment[army.unitType as RecruitUnitId]?.name ?? army.unitType} · {army.strength}</strong>
          <span className="hint">{army.attackOrder ? `Đang tấn công ${target ? targetName(target) : "?"}` : army.targetX !== undefined ? `Di chuyển đến (${army.targetX},${army.targetY})` : "Chờ lệnh"}</span>
        </div>
        <div className="army-stats">
          <span title="Sức mạnh">⚔ {army.strength}</span>
          <span title="Nhuệ khí">★ {army.morale}</span>
          <span title="Tiếp tế" className={army.supply < gameRules.supply.attritionBelowSupply ? "low-supply" : ""}>⛽ {army.supply}%</span>
          <span title="Vị trí">({army.x},{army.y})</span>
        </div>
        <div className="army-actions">
          <select title="Đội hình" aria-label="Đội hình" value={army.formation} onChange={event => runCommand({ kind: "set_formation", label: "Đổi đội hình", path: "/api/commands/formation", body: { armyId: army.id, formation: event.target.value } }).catch(() => undefined)}>
            <option value="line">Hàng ngang</option>
            <option value="wedge">Nêm</option>
            <option value="square">Vuông</option>
          </select>
          <button disabled={(army.attackOrder === undefined && army.targetX === undefined) || city.frozen} onClick={() => runCommand({ kind: "cancel_army_order", label: "Hủy lệnh", path: "/api/commands/cancel-army-order", body: { armyId: army.id } }).catch(() => undefined)}>Hủy lệnh</button>
          <button disabled={enemyArmies.length === 0} onClick={() => { setTargetId(""); setModal({ kind: "attack", armyId: army.id }); }}>
            {army.attackOrder ? "Đổi mục tiêu" : "Tấn công"}
          </button>
        </div>
      </div>;
    })}
    <div className="army-panel-footer">
      <button disabled={!hasBarracks || city.frozen} onClick={() => { setCount(10); setRecruitUnit("infantry"); setModal({ kind: "recruit" }); }}>
        {hasBarracks ? "Tuyển quân mới" : "Tuyển quân (cần Doanh trại)"}
      </button>
    </div>

    {modal?.kind === "recruit" && (
      <div className="modal-backdrop" onClick={() => setModal(null)}>
        <div className="modal-card" role="dialog" aria-label="Tuyển quân" onClick={event => event.stopPropagation()}>
          <h3>Tuyển quân</h3>
          {(["infantry", "cavalry", "archer"] as RecruitUnitId[]).map(id => (
            <label key={id} className="recruit-choice">
              <input type="radio" name="recruit-unit" checked={recruitUnit === id} onChange={() => setRecruitUnit(id)} />
              <span><strong>{gameRules.recruitment[id].name}</strong> · {gameRules.recruitment[id].description}</span>
            </label>
          ))}
          <p className="hint">Số lượng: {count}</p>
          <input type="range" min={gameRules.army.recruitAmountMin} max={gameRules.army.recruitAmountMax} step={gameRules.army.recruitAmountStep} value={count} onChange={event => setCount(Number(event.target.value))} aria-label="Số lượng" />
          <p className="hint">Chi phí: {unitCost.wood}g {unitCost.stone}đ {unitCost.iron}s{!canAfford && " — không đủ tài nguyên"}</p>
          <div className="modal-actions">
            <button onClick={() => setModal(null)}>Hủy</button>
            <button disabled={!canAfford || city.frozen} autoFocus onClick={() => runCommand({ kind: "recruit", label: "Tuyển quân", path: "/api/commands/recruit", body: { cityId: city.id, unitType: recruitUnit, amount: count } }).then(() => setModal(null)).catch(() => undefined)}>Tuyển {count} {gameRules.recruitment[recruitUnit].name}</button>
          </div>
        </div>
      </div>
    )}

    {modal?.kind === "attack" && (
      <div className="modal-backdrop" onClick={() => setModal(null)}>
        <div className="modal-card" role="dialog" aria-label="Tấn công" onClick={event => event.stopPropagation()}>
          <h3>Tấn công</h3>
          <p className="hint">Chọn mục tiêu gần nhất. Quân đội sẽ truy đuổi mục tiêu đang chạy; lệnh có thể bị hủy bất kỳ lúc nào.</p>
          <select value={targetId} onChange={event => setTargetId(event.target.value)} aria-label="Mục tiêu tấn công">
            <option value="">Chọn mục tiêu…</option>
            {enemyArmies
              .map(target => ({ target, distance: Math.abs(target.x - city.x) + Math.abs(target.y - city.y) }))
              .sort((a, b) => a.distance - b.distance)
              .map(({ target, distance }) => (
                <option value={target.id} key={target.id}>{targetName(target)} · {gameRules.recruitment[target.unitType as RecruitUnitId]?.name ?? target.unitType} · {target.strength} ({distance} ô)</option>
              ))}
          </select>
          <div className="modal-actions">
            <button onClick={() => setModal(null)}>Hủy</button>
            <button disabled={!targetId || city.frozen} autoFocus onClick={() => runCommand({ kind: "attack", label: "Ra lệnh tấn công", path: "/api/commands/attack", body: { armyId: modal.armyId, targetArmyId: targetId } }).then(() => setModal(null)).catch(() => undefined)}>Ra lệnh tấn công</button>
          </div>
        </div>
      </div>
    )}
  </section>;
}