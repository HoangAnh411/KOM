// A control's own order, shown beside that control.
//
// Every pending command already appears in the strip at the foot of the column,
// which is the right place for "what have I got in flight" and the wrong place
// for "did *this* button work". The strip is below the fold at 288px, and in the
// compact band the whole column is closed, so the player who clicked Xây kho had
// no way to see that their click landed. This chip is that answer, and it is the
// only new thing on screen: the state, its wording and its colour all come from
// the eight-state registry.

import { pendingFor } from "../commands.js";
import { useGame } from "../state.js";
import { Button } from "../ui/Button.js";
import { StatusChip } from "../ui/Status.js";

/** One wording for the one thing that stops a retry. Both the chip and the
 *  strip's own retry button read it from here: they are two views of the same
 *  command, and two sentences for the same blockage would read as two problems. */
export const offlineRetryReason = "Chưa kết nối máy chủ — chờ mạng trở lại rồi thử lại.";

/** `kind` alone is too coarse — one kind backs four build buttons — so callers
 *  pass the discriminating slice of the command body (`{ buildingId }`,
 *  `{ armyId }`, `{ caravanId }`) and get the entry that belongs to them.
 *
 *  Deliberately not tagged `data-testid="pending-command"`: that testid means
 *  "a row of the strip", three specs count them, and a second element wearing it
 *  would make `toHaveCount(0)` a lie about a settled queue. */
export function PendingChip({ kind, match }: { kind: string; match?: Record<string, unknown> }) {
  const { pending, connection, retryPending } = useGame();
  const command = pendingFor(pending, kind, match);
  if (!command) return null;
  if (command.status === "sending") return <span className="control-status"><StatusChip state="pending" /></span>;
  // Uncertain is the state that needs a way out, not just a colour: the command
  // id is kept so the retry is the same command, and the server's idempotency
  // dedupe — not the player's luck — decides whether it applies twice.
  return <span className="control-status">
    <StatusChip state="uncertain" />
    <Button
      variant="ghost"
      density="compact"
      disabled={connection !== "online"}
      reason={offlineRetryReason}
      onClick={() => retryPending(command.commandId)}
    >Thử lại</Button>
  </span>;
}
