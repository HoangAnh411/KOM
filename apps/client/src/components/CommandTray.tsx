import { useEffect, useState } from "react";
import { gameRules } from "@kingdoms/shared";
import type { Army } from "@kingdoms/shared";
import { useGame } from "../state.js";
import { cancelable, hasEnemy, isOwnLiveArmy, mergeCandidates } from "../validation.js";

/** Row 3 of the Situation Room: the contextual command area.
 *
 *  It carries the selection inspector unchanged — same region, same accessible
 *  name, same four branches, same buttons — because that inspector already *is*
 *  "commands for what you have selected", and PR3 is a layout change. Moving it
 *  out of the floating action bar into a full-width tray is the layout change:
 *  the tray is a grid row the map sits on top of, so ordering a move no longer
 *  means a panel appearing over the tile you are aiming at.
 *
 *  The right half is deliberately an empty slot with a label. PR5 fills it with
 *  contextual command groups; until then it reserves the space so the tray does
 *  not change height when that lands. */
export function CommandTray() {
  const { state, selection, interaction, beginOrder, cancelOrder, runCommand } = useGame();
  const session = state.session!;
  const [mergeTarget, setMergeTarget] = useState("");
  // The old inspector cleared this inside the map's select handler. The tray owns
  // the value now, so it clears when the selection it belongs to changes.
  useEffect(() => { setMergeTarget(""); }, [selection]);

  const selectedArmy = selection?.kind === "army" ? state.snapshot?.armies.find(item => item.id === selection.id && item.strength > 0) : undefined;
  const selectedCity = selection?.kind === "city" ? state.snapshot?.cities.find(item => item.id === selection.id) : undefined;
  const unitName = (army: Army) => {
    if (army.npcKind === "raider") return "Băng cướp";
    if (army.npcKind === "migration") return "Đám di cư";
    const unit = gameRules.recruitment[army.unitType as keyof typeof gameRules.recruitment];
    return unit?.name ?? army.unitType;
  };
  const ownerName = (army: Army) => army.ownerPlayerId ? (state.snapshot?.cities.find(city => city.playerId === army.ownerPlayerId)?.playerName ?? "?") : "NPC";
  const mine = isOwnLiveArmy(selectedArmy, session.player.id);
  const mergeCandidatesFor = selectedArmy ? mergeCandidates(state.snapshot?.armies ?? [], selectedArmy, session.player.id) : [];
  const canOrder = (mode: "move" | "attack") => mine && (mode === "move" || hasEnemy(state.snapshot?.armies ?? [], session.player.id));

  return <div className="command-tray">
    <div className="map-inspector command-tray__context" role="region" aria-label="Lệnh cho lựa chọn">
      {interaction.kind !== "idle" ? (
        <div className="map-inspector-hint" role="status">{interaction.kind === "move" ? "Nhấp vào bản đồ để chọn điểm đến" : "Nhấp vào quân địch để ra lệnh tấn công"} <button onClick={cancelOrder}>Hủy</button></div>
      ) : selection?.kind === "army" && selectedArmy ? (
        <>
          <strong>{unitName(selectedArmy)} · {selectedArmy.strength}</strong>
          <span className="hint">{ownerName(selectedArmy)} · ⚔ {selectedArmy.strength} · ★ {selectedArmy.morale} · ⛽ {selectedArmy.supply}% · ({selectedArmy.x},{selectedArmy.y})</span>
          <div className="map-inspector-actions">
            <button disabled={!canOrder("move")} onClick={() => beginOrder("move", selectedArmy.id)}>Di chuyển</button>
            <button disabled={!canOrder("attack")} onClick={() => beginOrder("attack", selectedArmy.id)}>Tấn công</button>
            <select value={mergeTarget} onChange={event => setMergeTarget(event.target.value)} aria-label="Quân gộp vào đây">
              <option value="">Hợp nhất: chọn quân cùng loại cùng ô…</option>
              {mergeCandidatesFor.map(item => <option value={item.id} key={item.id}>QĐ {unitName(item)} ({item.strength})</option>)}
            </select>
            <button disabled={!mergeTarget} onClick={() => runCommand({ kind: "merge_army", label: "Hợp nhất quân", path: "/api/commands/merge-army", body: { sourceArmyId: mergeTarget, targetArmyId: selectedArmy.id } }).then(() => setMergeTarget("")).catch(() => undefined)}>Hợp nhất vào quân này</button>
            {cancelable(selectedArmy) && <button onClick={() => runCommand({ kind: "cancel_army_order", label: "Hủy lệnh", path: "/api/commands/cancel-army-order", body: { armyId: selectedArmy.id } }).catch(() => undefined)}>Hủy lệnh</button>}
          </div>
        </>
      ) : selection?.kind === "city" && selectedCity ? (
        <>
          <strong>{selectedCity.name}</strong>
          <span className="hint">{selectedCity.playerName} · ({selectedCity.x},{selectedCity.y})</span>
        </>
      ) : (
        <>
          <strong>{selection?.kind === "tile" ? `Ô đất (${selection.x},${selection.y})` : "Chưa chọn gì"}</strong>
          <span className="hint">{selection?.kind === "tile" ? "Chọn quân đội của bạn trên bản đồ để ra lệnh di chuyển hoặc tấn công." : "Nhấp vào quân đội, thành phố hoặc ô đất trên bản đồ."}</span>
        </>
      )}
    </div>
    <p className="command-tray__reserved">Lệnh theo ngữ cảnh sẽ xuất hiện ở đây.</p>
  </div>;
}
