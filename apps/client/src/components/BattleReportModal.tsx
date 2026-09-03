import type { BattleReport } from "@kingdoms/shared";
import { Modal } from "../ui/Modal.js";

const unitNames = { infantry: "Bộ binh", cavalry: "Kỵ binh", archer: "Cung thủ" } as const;
const formationNames = { line: "Đội hình hàng ngang", wedge: "Đội hình nêm", square: "Đội hình phòng ngự" } as const;
const terrainNames = { plains: "Đồng bằng", forest: "Rừng", hills: "Đồi", swamp: "Đầm lầy" } as const;
const victorNames = { attacker: "Tấn công thắng", defender: "Phòng thủ thắng", draw: "Hòa" } as const;
const sideNames = { attacker: "Tấn công", defender: "Phòng thủ" } as const;
const npcNames = { raider: "Bọn cướp", migration: "Đoàn di cư" } as const;

export function BattleReportModal({ report, onClose }: { report: BattleReport; onClose: () => void }) {
  return <Modal title="Báo cáo trận đánh" onClose={onClose} actions={<button onClick={onClose}>Đóng</button>}>
    <p className="report-meta">{terrainNames[report.terrain]} · Ô {report.tileX},{report.tileY} · <strong>{victorNames[report.victor]}</strong></p>
    <div className="report-sides">
      {([report.attacker, report.defender] as const).map((side, index) => (
        <div className="report-side" key={side.armyId}>
          <strong>{sideNames[index === 0 ? "attacker" : "defender"]}</strong>
          <p>{unitNames[side.unitType]} · {formationNames[side.formation]}{side.npcKind ? ` · ${npcNames[side.npcKind]}` : ""}</p>
          <p>Sức chiến đấu: {side.strengthBefore} → {side.strengthAfter}</p>
          <p>Nhuệ khí: {side.moraleBefore} → {side.moraleAfter}</p>
        </div>
      ))}
    </div>
    {report.rounds.length > 0 && <details className="report-rounds">
      <summary>{report.rounds.length} hiệp đấu</summary>
      {report.rounds.map(round => <div key={round.round}>Hiệp {round.round}: ⚔ {round.attackerStrength} - {round.defenderStrength}</div>)}
    </details>}
  </Modal>;
}