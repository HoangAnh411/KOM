import { useEffect, useState } from "react";
import type { SurfaceId } from "../layout.js";
import { usePanelJump } from "../panel-anchors.js";
import { useGame } from "../state.js";
import { trayGroups, traySubject, type TrayCommand, type TrayGroup, type TrayIntent } from "../tray-groups.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";
import { Modal } from "../ui/Modal.js";
import { armyLabel } from "../vocabulary.js";

/** Row 3 of the Situation Room: what is selected, and what can be done to it.
 *
 *  The left half names the selection. The right half shipped as an empty slot
 *  holding the height for "contextual command groups" that had not been written;
 *  `tray-groups.ts` is that table, and this file is only its markup — every
 *  decision about which commands exist, which are blocked and what the reason
 *  says is made there, where a runner without a DOM can assert it.
 *
 *  Two things about this component are load-bearing and neither is visible in the
 *  markup:
 *
 *  1. `role="region"` sits on the tray itself rather than on the left half. Both
 *     halves are about one selection, and the name a player hears for the whole
 *     strip is the name the old floating inspector had.
 *  2. Nothing here may change the tray's height. It shares a grid row with the
 *     map, and the map's box is what Pixi sizes its canvas from, so the buttons
 *     are `nowrap`, capped at four by the table, and a blocked one lays its reason
 *     out *beside* it instead of under it (`.command-tray__commands .kom-btn-gate`
 *     flips the primitive's column to a row). */
export function CommandTray({ onReveal }: { onReveal: (id: SurfaceId) => void }) {
  const { state, selection, interaction, beginOrder, cancelOrder, runCommand } = useGame();
  const session = state.session!;
  const jump = usePanelJump(onReveal);
  /** The merge dialog is opened by an intent and carries its own candidate list,
   *  so the list the player picks from is the one the gate was decided from. */
  const [merging, setMerging] = useState<Extract<TrayIntent, { kind: "merge" }> | null>(null);
  // The dialog belongs to the selection that opened it: clicking elsewhere on the
  // map must not leave a merge open against an army the tray no longer names.
  useEffect(() => { setMerging(null); }, [selection]);

  const subject = traySubject(selection, state.snapshot, session.player.id);
  const groups = trayGroups(selection, interaction, state.snapshot, session.player.id);

  const run = (intent: TrayIntent): void => {
    switch (intent.kind) {
      case "order": return beginOrder(intent.mode, intent.armyId);
      case "cancel-order": return cancelOrder();
      case "command": { void runCommand(intent.command).catch(() => undefined); return; }
      case "merge": return setMerging(intent);
      case "panel": return jump(intent.anchor);
    }
  };

  return <div className="command-tray" role="region" aria-label="Lệnh cho lựa chọn">
    <div className="command-tray__context">
      <strong className="kom-num">{subject.title}</strong>
      <span className="command-tray__detail kom-num">{subject.detail}</span>
    </div>
    <div className="command-tray__commands">
      {groups.map(group => <TrayGroupView
        key={group.id}
        group={group}
        // The one case worth announcing: the player pressed an order and the next
        // click belongs to the map. Every other hint arrives because they clicked
        // something, and a live region that fires on every map click is noise.
        live={interaction.kind !== "idle"}
        onRun={run}
      />)}
    </div>
    {merging && merging.candidates.length > 0
      ? <MergeDialog intent={merging} onClose={() => setMerging(null)} onRun={run} />
      : null}
  </div>;
}

function TrayGroupView({ group, live, onRun }: { group: TrayGroup; live: boolean; onRun: (intent: TrayIntent) => void }) {
  return <div className="command-tray__group" role="group" aria-label={group.title}>
    <span className="command-tray__group-title"><Icon name={group.icon} size="sm" />{group.title}</span>
    {group.commands.map(command => <TrayButton key={command.id} command={command} onRun={onRun} />)}
    {group.hint ? <span className="command-tray__hint" role={live ? "status" : undefined}>{group.hint}</span> : null}
  </div>;
}

/** `data-command` is the id the table gave the command: the e2e spec presses the
 *  button by it, so a reworded label does not break a test that is about the
 *  command existing. */
const TrayButton = ({ command, onRun }: { command: TrayCommand; onRun: (intent: TrayIntent) => void }) => <Button
  variant={command.variant}
  density="compact"
  data-command={command.id}
  disabled={!command.check.ok}
  reason={command.check.reason}
  onClick={() => onRun(command.intent)}
>{command.label}</Button>;

/** Merge is the one tray command that needs an argument, and it used to ask for
 *  it with a `<select>` sitting in the strip — the widest control in the tray, and
 *  a dropdown the player had to open before they could see whether merging was
 *  possible at all. As a dialog the question is asked only when the answer can be
 *  acted on, and the gate on the button already said whether that is now. */
function MergeDialog({ intent, onClose, onRun }: {
  intent: Extract<TrayIntent, { kind: "merge" }>;
  onClose: () => void;
  onRun: (intent: TrayIntent) => void;
}) {
  const [sourceArmyId, setSourceArmyId] = useState(intent.candidates[0]?.id ?? "");
  const confirm = () => {
    onRun({
      kind: "command",
      // The payload `CommandTray` has always sent: the chosen army folds *into*
      // the selected one, so the selection survives the merge and the tray keeps
      // naming something that exists.
      command: { kind: "merge_army", label: "Hợp nhất quân", path: "/api/commands/merge-army", body: { sourceArmyId, targetArmyId: intent.armyId } },
    });
    onClose();
  };
  return <Modal
    title="Hợp nhất quân đội"
    onClose={onClose}
    actions={<>
      <Button variant="ghost" onClick={onClose}>Hủy</Button>
      <Button variant="primary" onClick={confirm}>Hợp nhất vào quân này</Button>
    </>}
  >
    <p className="kom-meta">Quân được chọn sẽ nhập vào quân đang chọn trên bản đồ và biến mất khỏi bản đồ.</p>
    {intent.candidates.map(candidate => <label key={candidate.id} className="modal-choice">
      <input
        type="radio"
        name="merge-source"
        value={candidate.id}
        checked={sourceArmyId === candidate.id}
        onChange={() => setSourceArmyId(candidate.id)}
      />
      <span>{armyLabel(candidate)} · <span className="kom-num">{candidate.strength}</span></span>
    </label>)}
  </Modal>;
}
