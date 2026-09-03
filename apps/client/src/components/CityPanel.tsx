import { useEffect, useState } from "react";
import { gameRules } from "@kingdoms/shared";
import { useGame } from "../state.js";
import { usePanelAnchor } from "../panel-anchors.js";
import { formatCost } from "../vocabulary.js";

type BuildingId = keyof typeof gameRules.buildings;

export function CityPanel() {
  const { state, runCommand } = useGame();
  const session = state.session!; const snapshot = state.snapshot!;
  const city = snapshot.cities.find(item => item.playerId === session.player.id) ?? snapshot.cities[0];
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const depot = snapshot.logistics.depots.find(item => item.cityId === city.id);
  const queuesFull = city.queues.filter(queue => queue.type === "build").length >= 2;
  const anchor = usePanelAnchor<HTMLElement>("city");

  return <section ref={anchor} className="city-panel" aria-label={"Thành phố & công trình"}>
    <h2>Thành phố & công trình</h2>
    <div className="actions">
      <button disabled={city.frozen || queuesFull} onClick={() => runCommand({ kind: "build", label: "Xây kho", path: "/api/commands/build", body: { cityId: city.id, buildingId: "warehouse", queueType: "build" } }).catch(() => undefined)}>Xây kho</button>
      <button disabled={city.frozen || queuesFull} onClick={() => runCommand({ kind: "build", label: "Xây trạm trung chuyển", path: "/api/commands/build", body: { cityId: city.id, buildingId: "road_depot", queueType: "build" } }).catch(() => undefined)}>Xây trạm trung chuyển</button>
      <button disabled={city.frozen || queuesFull} onClick={() => runCommand({ kind: "build", label: "Xây trại lính", path: "/api/commands/build", body: { cityId: city.id, buildingId: "barracks", queueType: "build" } }).catch(() => undefined)}>Xây trại lính</button>
    </div>
    <p>Build queues: {city.queues.filter(queue => queue.type === "build").length}/2</p>
    <div className="building-list">
      {(Object.entries(gameRules.buildings) as Array<[BuildingId, (typeof gameRules.buildings)[BuildingId]]>).map(([id, rule]) => {
        const level = city.buildings[id] ?? 0;
        const queued = city.queues.find(queue => queue.type === "build" && queue.buildingId === id);
        return <div className="building-row" key={id}>
          <div className="building-title"><strong>{rule.name}</strong><span className="hint">{level > 0 ? `Cấp ${level}` : "Chưa xây"}</span></div>
          <p className="hint">{rule.description}</p>
          {queued
            ? <p className="hint">Đang xây · còn {Math.max(0, Math.ceil((Date.parse(queued.completesAt) - now) / 1000))}s</p>
            : <button className="building-build" disabled={city.frozen || queuesFull} onClick={() => runCommand({ kind: "build", label: `Xây ${rule.name}`, path: "/api/commands/build", body: { cityId: city.id, buildingId: id, queueType: "build" } }).catch(() => undefined)}>Xây · {formatCost(rule.cost)}</button>}
        </div>;
      })}
    </div>
    {depot && <p className="hint">Trạm tiếp tế cấp {depot.level} · sức chứa {depot.capacity} tấn</p>}
  </section>;
}