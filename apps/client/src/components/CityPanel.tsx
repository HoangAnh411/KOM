import { useEffect, useState } from "react";
import { gameRules } from "@kingdoms/shared";
import { useGame } from "../state.js";
import { usePanelAnchor } from "../panel-anchors.js";
import { affordable, buildQueueRoom, firstReason, notFrozen } from "../validation.js";
import { formatCost } from "../vocabulary.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";
import { Panel, PanelBody, PanelHeader } from "../ui/Panel.js";
import { PendingChip } from "./PendingChip.js";

type BuildingId = keyof typeof gameRules.buildings;

/** The server does cap the build queue at two (`store.startBuild` throws
 *  `QUEUE_LIMIT_REACHED`), but the number is not in `gameRules`, so the client
 *  has to mirror it. Stated once here instead of three times down the panel; if
 *  it ever reaches `gameRules`, this is the one line that changes. */
const buildQueueLimit = 2;

/** The three buildings worth a shortcut at the top of the panel — the ones a new
 *  player is sent to build by the onboarding list. Every building, these three
 *  included, also has its own row further down with its price on the button; the
 *  shortcuts exist so the common case is one click from the top of the column. */
const shortcuts: Array<{ id: BuildingId; label: string }> = [
  { id: "warehouse", label: "Xây kho" },
  { id: "road_depot", label: "Xây trạm trung chuyển" },
  { id: "barracks", label: "Xây trại lính" },
];
const shortcutIds = new Set(shortcuts.map(shortcut => shortcut.id));

export function CityPanel() {
  const { state, runCommand } = useGame();
  const session = state.session!; const snapshot = state.snapshot!;
  const city = snapshot.cities.find(item => item.playerId === session.player.id) ?? snapshot.cities[0];
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const depot = snapshot.logistics.depots.find(item => item.cityId === city.id);
  const queued = city.queues.filter(queue => queue.type === "build");
  const anchor = usePanelAnchor<HTMLElement>("city");

  /** Why this building cannot be started, or nothing. Three conditions in the
   *  order the player should act on them: an unfrozen city with a free slot and
   *  no money is a money problem, but a frozen one is not a money problem at all.
   *
   *  Affordability is the addition. The panel used to let the click through and
   *  let the server answer with a 400, so "I cannot afford this" arrived as a red
   *  toast saying `insufficient_resources` — after the player had already
   *  committed to the order. */
  const blocked = (id: BuildingId): string | undefined => firstReason(
    notFrozen(city),
    buildQueueRoom(city, buildQueueLimit),
    affordable(city, gameRules.buildings[id].cost),
  );

  const build = (id: BuildingId, label: string) => runCommand({
    kind: "build", label, path: "/api/commands/build",
    body: { cityId: city.id, buildingId: id, queueType: "build" },
  }).catch(() => undefined);

  return <Panel accent="brass" className="city-panel" panelRef={anchor} aria-label={"Thành phố & công trình"}>
    <PanelHeader title={<><Icon name="city" size="sm" /> Thành phố & công trình</>} />
    <PanelBody>
      {/* One chip per order, beside a control that can issue it. Two controls do
          issue the same build — the shortcut and the building's own row — so the
          shortcut carries the chip when there is one and the row carries it for
          the building that has none. Two chips and two "Thử lại" buttons for one
          command id would read as two orders in flight. */}
      <div className="city-actions">
        {shortcuts.map(shortcut => {
          const reason = blocked(shortcut.id);
          return <div className="city-action" key={shortcut.id}>
            <Button
              variant="secondary"
              density="compact"
              disabled={Boolean(reason)}
              reason={reason}
              onClick={() => build(shortcut.id, shortcut.label)}
            >{shortcut.label}</Button>
            <PendingChip kind="build" match={{ buildingId: shortcut.id }} />
          </div>;
        })}
      </div>
      <p className="kom-meta">Build queues: {queued.length}/{buildQueueLimit}</p>
      <div className="building-list">
        {(Object.entries(gameRules.buildings) as Array<[BuildingId, (typeof gameRules.buildings)[BuildingId]]>).map(([id, rule]) => {
          const level = city.buildings[id] ?? 0;
          const building = queued.find(queue => queue.buildingId === id);
          const reason = blocked(id);
          return <div className="building-row" key={id}>
            <div className="building-title"><strong>{rule.name}</strong><span className="kom-meta">{level > 0 ? `Cấp ${level}` : "Chưa xây"}</span></div>
            <p className="kom-meta">{rule.description}</p>
            {building
              ? <p className="kom-meta"><Icon name="clock" size="sm" /> Đang xây · còn <span className="kom-num">{Math.max(0, Math.ceil((Date.parse(building.completesAt) - now) / 1000))}</span>s</p>
              : <div className="row-actions">
                <Button
                  variant="ghost"
                  density="compact"
                  disabled={Boolean(reason)}
                  reason={reason}
                  onClick={() => build(id, `Xây ${rule.name}`)}
                >Xây · {formatCost(rule.cost)}</Button>
                {!shortcutIds.has(id) && <PendingChip kind="build" match={{ buildingId: id }} />}
              </div>}
          </div>;
        })}
      </div>
      {depot && <p className="kom-meta">Trạm tiếp tế cấp {depot.level} · sức chứa {depot.capacity} tấn</p>}
    </PanelBody>
  </Panel>;
}
