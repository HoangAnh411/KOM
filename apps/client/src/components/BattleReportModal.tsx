import type { BattleReport } from "@kingdoms/shared";
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

export function BattleReportModal({ report, onClose }: { report: BattleReport; onClose: () => void }) {
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
    {report.rounds.length > 0 && <details className="report-rounds">
      <summary>{report.rounds.length} hiệp đấu</summary>
      {/* `⚔ 120 - 80` named neither number: the glyph had no accessible name and the
          dash left which side was which to the reader's guess. The two words are
          already in `sideNames`, which is where the columns above get theirs. */}
      {report.rounds.map(round => <div key={round.round}>
        Hiệp {round.round}: {sideNames.attacker} <span className="kom-num">{round.attackerStrength}</span> · {sideNames.defender} <span className="kom-num">{round.defenderStrength}</span>
      </div>)}
    </details>}
  </Modal>;
}