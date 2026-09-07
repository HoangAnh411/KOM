import { useEffect, useState } from "react";
import type { ArmyPosition, BattleReport, TroopType } from "@kingdoms/shared";
import { Button } from "../ui/Button.js";
import { Modal } from "../ui/Modal.js";
import { armyLabel, formationLabels } from "../vocabulary.js";

// What is left here is what only a battle report says: the ground it was fought
// on, who won, and which side each column is. The three that used to sit beside
// them — unit, formation, npc kind — are the same three the army panel and the
// command tray name, and this file disagreed with both: "Đội hình phòng ngự"
// against the picker's "Vuông", "Bọn cướp" against the tray's "Băng cướp". They
// come from `vocabulary.ts` now.
const terrainNames = { plains: "Đồng bằng", forest: "Rừng", hills: "Đồi", swamp: "Đầm lầy" } as const;
const victorNames = { attacker: "Tấn công thắng", defender: "Phòng thủ thắng", draw: "Hòa" } as const;
const sideNames = { attacker: "Tấn công", defender: "Phòng thủ" } as const;
const positionNames: Record<ArmyPosition, string> = { frontline: "tiền tuyến", backline: "hậu tuyến", flank: "cánh" };
const troopNames: Record<TroopType, string> = { shield_infantry: "Bộ binh khiên", spearmen: "Giáo binh", archers: "Cung thủ", cavalry: "Kỵ binh" };
const commanderSkills = { infantry: "Tiền tuyến giảm sát thương trong hai hiệp đầu.", archer: "Cung thủ tăng sát thương ở hiệp 3.", cavalry: "Kỵ binh ở cánh tăng sát thương ở hiệp đầu.", logistics: "Hồi nhuệ khí ở đầu hiệp 3." } as const;

export function BattleReportModal({ report, onClose }: { report: BattleReport; onClose: () => void }) {
  const roundCount = report.rounds.length;
  const [replayRound, setReplayRound] = useState(roundCount);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (replayRound >= roundCount) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setReplayRound(current => Math.min(roundCount, current + 1)), 650);
    return () => window.clearTimeout(timer);
  }, [playing, replayRound, roundCount]);
  // One replay pointer for both views: the classic strength ladder and the
  // mixed-engine detail must reveal the same rounds at the same time, or the
  // "đang xem X/Y" counter lies about one of them.
  const shownRounds = report.rounds.slice(0, replayRound);
  const shownMixedRounds = report.mixed
    ? report.mixed.rounds.slice(0, roundCount > 0 ? replayRound : report.mixed.rounds.length)
    : [];
  return <Modal title="Báo cáo trận đánh" onClose={onClose} actions={<Button variant="ghost" onClick={onClose}>Đóng</Button>}>
    <p className="report-meta">{terrainNames[report.terrain]} · Ô {report.tileX},{report.tileY} · <strong>{victorNames[report.victor]}</strong></p>
    <div className="report-sides">
      {([report.attacker, report.defender] as const).map((side, index) => (
        <div className="report-side" key={side.armyId}>
          <strong>{sideNames[index === 0 ? "attacker" : "defender"]}</strong>
          <p>{armyLabel(side)} · Đội hình {formationLabels[side.formation]}</p>
          <p>Sức chiến đấu: {side.strengthBefore} → {side.strengthAfter}</p>
          <p>Nhuệ khí: {side.moraleBefore} → {side.moraleAfter}</p>
        </div>
      ))}
    </div>
    {report.rounds.length > 0 && <details className="report-rounds" open>
      <summary>{report.rounds.length} hiệp đấu</summary>
      <div className="report-replay-controls">
        <Button density="compact" variant="secondary" onClick={() => { setReplayRound(0); setPlaying(true); }}>Xem lại</Button>
        <Button density="compact" variant="ghost" disabled={!playing} reason={!playing ? "Chưa phát lại trận." : undefined} onClick={() => { setPlaying(false); setReplayRound(roundCount); }}>Bỏ qua</Button>
        <span className="kom-meta">Đang xem {Math.min(replayRound, roundCount)}/{roundCount} hiệp từ dữ liệu máy chủ.</span>
      </div>
      {/* `⚔ 120 - 80` named neither number: the glyph had no accessible name and the
          dash left which side was which to the reader's guess. The two words are
          already in `sideNames`, which is where the columns above get theirs. */}
      {shownRounds.map(round => <div key={round.round}>
        Hiệp {round.round}: {sideNames.attacker} <span className="kom-num">{round.attackerStrength}</span> · {sideNames.defender} <span className="kom-num">{round.defenderStrength}</span>
      </div>)}
    </details>}
    {report.mixed && <details className="report-rounds" open>
      <summary>Phối quân, buff và nguyên nhân</summary>
      <p>Chỉ huy: {report.mixed.attacker.commanderSpecialty} cấp {report.mixed.attacker.commanderLevel} · {report.mixed.defender.commanderSpecialty} cấp {report.mixed.defender.commanderLevel}</p>
      <p>Kỹ năng: {commanderSkills[report.mixed.attacker.commanderSpecialty]} {commanderSkills[report.mixed.defender.commanderSpecialty]}</p>
      {shownMixedRounds.map(round => <div key={`mixed-${round.round}`}>
        <strong>Hiệp {round.round}</strong>: {round.explanations.length ? round.explanations.join(" ") : "Hai bên chọn mục tiêu theo vị trí còn sống."}
        {round.actions?.map(action => <div key={round.round + "-" + action.sourceSquadId + "-" + action.targetSquadId}>Mục tiêu {action.sourceSquadId} → {action.targetSquadId}{action.skill ? " · Kỹ năng: " + action.skill : ""}</div>)}
        <div>{[...round.attacker, ...round.defender].map(group => troopNames[group.troopType] + " (" + positionNames[group.position] + "): mất " + group.casualties + ", còn " + group.countAfter).join(" · ")}</div>
      </div>)}
      <p>Thương vong: {report.mixed.attacker.killed + report.mixed.attacker.wounded} bên tấn công · {report.mixed.defender.killed + report.mixed.defender.wounded} bên phòng thủ.</p>
    </details>}
  </Modal>;
}
