import { useEffect, useState } from "react";
import { gameRules } from "@kingdoms/shared";
import { useGame } from "../state.js";
import { caravanReady, cargoWithinCapacity, cargoWithinResources, harvestReady, routeReady } from "../validation.js";
import { usePanelAnchor } from "../panel-anchors.js";
import { formatCargo, resourceLabels } from "../vocabulary.js";

const nodeNames = { wood: "Rừng", stone: "Mỏ đá", iron: "Mỏ sắt" } as const;
const cargoOptions = [10, 25, 50] as const;

export function LogisticsPanel() {
  const { state, runCommand } = useGame();
  const session = state.session!; const snapshot = state.snapshot!;
  const city = snapshot.cities.find(item => item.playerId === session.player.id) ?? snapshot.cities[0];
  const [now, setNow] = useState(Date.now());
  const [harvestAmount, setHarvestAmount] = useState<number>(25);
  const [destId, setDestId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [cargo, setCargo] = useState({ wood: 10, stone: 0, iron: 0 });
  const [escortId, setEscortId] = useState("");
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);

  const marketHubs = snapshot.logistics.marketHubs;
  const activeRoutes = snapshot.logistics.tradeRoutes.filter(route => route.ownerPlayerId === session.player.id && route.status === "active");
  const activeCaravans = snapshot.caravans.filter(caravan => caravan.ownerPlayerId === session.player.id && caravan.status === "moving");
  const myArmies = snapshot.armies.filter(army => army.ownerPlayerId === session.player.id && army.strength > 0 && !army.frozen);
  const depot = snapshot.logistics.depots.find(item => item.cityId === city.id);
  const cargoTotal = cargo.wood + cargo.stone + cargo.iron;
  const countdown = (endsAt: string) => { const seconds = Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 1000)); return `${Math.floor(seconds / 60)}m ${seconds % 60}s`; };
  const destinationName = (caravan: (typeof snapshot.caravans)[number]) => caravan.destinationKind === "market" ? (marketHubs.find(hub => hub.id === caravan.destinationMarketId)?.name ?? "Thương cảng") : (snapshot.cities.find(item => item.id === caravan.destinationCityId)?.name ?? "?");
  const sourceName = (id: string) => snapshot.cities.find(item => item.id === id)?.name ?? "?";
  const routeCheck = routeReady(depot, destId);
  const caravanCheck = city.frozen ? { ok: false as const, reason: "Thành phố đang bị đóng băng." } : caravanReady(depot, city, cargo);
  const withinCapacity = cargoWithinCapacity(depot, cargo);
  const withinResources = cargoWithinResources(city, cargo);
  const anchor = usePanelAnchor<HTMLElement>("logistics");

  return <section ref={anchor} className="logistics-panel" aria-label={"Kinh tế & vận tải"}>
    <h2>Kinh tế & vận tải</h2>

    <div className="logistics-block">
      <h3>Mỏ tài nguyên</h3>
      <p className="hint">Khai thác đưa tài nguyên về kho thành phố — mỏ hồi phục dần theo thời gian.</p>
      <label className="hint">Lượng khai thác:
        <select value={harvestAmount} onChange={event => setHarvestAmount(Number(event.target.value))}>{cargoOptions.map(option => <option value={option} key={option}>{option}</option>)}</select>
      </label>
      <div className="node-list">
        {snapshot.logistics.resourceNodes.slice(0, 8).map(node => {
          const check = harvestReady(node, harvestAmount);
          return <div className="node-row" key={node.id}>
            <span><strong>{nodeNames[node.resourceType]}</strong> ({node.x},{node.y})</span>
            <span className="hint">{node.remaining}/{node.capacity}</span>
            <button disabled={city.frozen || !check.ok} title={check.reason} onClick={() => runCommand({ kind: "harvest", label: "Khai thác tài nguyên", path: "/api/commands/harvest", body: { nodeId: node.id, cityId: city.id, amount: harvestAmount } }).catch(() => undefined)}>Khai thác</button>
          </div>;
        })}
      </div>
    </div>

    <div className="logistics-block">
      <h3>Tuyến vận tải</h3>
      <p className="hint">Cần trạm tiếp tế (road_depot) trước khi lập tuyến. Kho tăng sức chứa cho các chuyến.</p>
      <div className="route-creator">
        <p className="hint">Tuyến vận tải trong alpha chỉ đến chợ (thành phố → thành phố sẽ mở khi có nhiều thành phố mỗi người chơi).</p>
        <select value={destId} onChange={event => setDestId(event.target.value)} aria-label="Điểm đến">
          <option value="">Chọn điểm đến…</option>
          {marketHubs.map(hub => <option value={hub.id} key={hub.id}>{hub.name}</option>)}
        </select>
        <button disabled={city.frozen || !routeCheck.ok} title={routeCheck.reason} onClick={() => runCommand({ kind: "route", label: "Lập tuyến vận tải", path: "/api/commands/routes", body: { sourceCityId: city.id, destinationKind: "market", destinationId: destId } }).then(() => setDestId("")).catch(() => undefined)}>Lập tuyến</button>
        {!routeCheck.ok && !city.frozen && <span className="hint validation-reason">{routeCheck.reason}</span>}
      </div>
      {activeRoutes.length === 0 && <p className="hint">Chưa có tuyến nào.</p>}
      {activeRoutes.map(route => {
        const target = route.destinationKind === "market" ? (marketHubs.find(hub => hub.id === route.destinationMarketId)?.name ?? "Thương cảng") : sourceName(route.destinationCityId ?? "");
        return <div className="route-row" data-testid="route-row" key={route.id}>
          <span>{sourceName(route.sourceCityId)} → {target} ({route.distance} ô, {Math.ceil(route.travelTimeSeconds / 60)} phút)</span>
          <button className="route-select" onClick={() => setRouteId(route.id)}>{routeId === route.id ? "✓ đã chọn" : "Chọn gửi hàng"}</button>
        </div>;
      })}
    </div>

    {routeId && (
      <div className="logistics-block cargo-editor" role="group" aria-label="Gửi chuyến hàng">
        <h3>Gửi chuyến hàng</h3>
        <p className="hint">Xuất khẩu qua Thương cảng tính vào điểm kinh tế; hàng đến nơi sau thời gian vận chuyển.</p>
        <div className="cargo-grid">
          {(["wood", "stone", "iron"] as const).map(resource => (
            <label key={resource} className="hint">{resourceLabels[resource]}
              <button type="button" onClick={() => setCargo(cargo => ({ ...cargo, [resource]: Math.max(0, cargo[resource] - 10) }))}>−</button>
              <strong>{cargo[resource]}</strong>
              <button type="button" onClick={() => setCargo(cargo => ({ ...cargo, [resource]: Math.min(50, cargo[resource] + 10) }))}>+</button>
            </label>
          ))}
        </div>
        <p className="hint">Tổng hàng hóa: {cargoTotal}{depot ? ` / sức chứa ${depot.capacity}` : " (cần kho để gửi)"}{!withinCapacity && cargoTotal > 0 && depot && <span className="validation-reason"> — vượt sức chứa kho</span>}</p>
        {!withinResources && cargoTotal > 0 && <p className="hint validation-reason">Không đủ tài nguyên trong kho để gửi.</p>}
        {caravanCheck.reason && <p className="hint validation-reason">{caravanCheck.reason}</p>}
        <button disabled={!caravanCheck.ok} title={caravanCheck.reason} onClick={() => runCommand({ kind: "caravan", label: "Gửi caravan", path: "/api/commands/caravans", body: { routeId, cargo: { ...cargo, food: 0 } } }).then(() => setRouteId("")).catch(() => undefined)}>Gửi caravan</button>
      </div>
    )}

    <div className="logistics-block">
      <h3>Caravan đang chạy</h3>
      {activeCaravans.length === 0 && <p className="hint">Không có caravan nào đang di chuyển.</p>}
      {activeCaravans.map(caravan => (
        <div className="caravan-row" data-testid="caravan-row" key={caravan.id}>
          <div>
            <span>{sourceName(caravan.sourceCityId)} → {destinationName(caravan)}</span>
            <span className="hint"> {Math.round(caravan.progress * 100)}% · còn {caravan.arrivesAt ? countdown(caravan.arrivesAt) : "…"}{caravan.cargo ? ` · hàng ${formatCargo(caravan.cargo)}` : ""}</span>
          </div>
          {!caravan.escortArmyId && myArmies.length > 0 && (
            <div className="escort-row">
              <select value={escortId} onChange={event => setEscortId(event.target.value)} aria-label="Quân hộ tống">
                <option value="">Chọn quân hộ tống…</option>
                {myArmies.map(army => <option value={army.id} key={army.id}>QĐ {gameRules.recruitment[army.unitType as keyof typeof gameRules.recruitment].name} ({army.strength})</option>)}
              </select>
              <button disabled={!escortId} onClick={() => runCommand({ kind: "escort", label: "Hộ tống caravan", path: "/api/commands/escort", body: { caravanId: caravan.id, armyId: escortId } }).catch(() => undefined)}>Hộ tống</button>
            </div>
          )}
        </div>
      ))}
    </div>

    <div className="logistics-block export-note">
      <h3>Xuất khẩu là gì?</h3>
      <p className="hint">Lập tuyến đến <strong>{markupHubName(marketHubs)}</strong> và gửi caravan. Khi hàng cập bến, lượng gỗ/đá/sắt được tính là xuất khẩu — góp vào điểm kinh tế và mục tiêu “Đã xuất khẩu” trong phần giới thiệu. Bọn cướp có thể phục kích trên đường: cử quân hộ tống đem theo caravan để bảo vệ.</p>
    </div>
  </section>;
}

function markupHubName(hubs: { name: string }[]): string { return hubs[0]?.name ?? gameRules.market.name; }