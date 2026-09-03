import { useEffect, useState } from "react";
import { gameRules } from "@kingdoms/shared";
import { useGame } from "../state.js";
import { caravanReady, firstReason, harvestReady, notFrozen, routeReady } from "../validation.js";
import { usePanelAnchor } from "../panel-anchors.js";
import { formatCargo, resourceLabels } from "../vocabulary.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";
import { Panel, PanelBody, PanelHeader } from "../ui/Panel.js";
import { PendingChip } from "./PendingChip.js";

const nodeNames = { wood: "Rừng", stone: "Mỏ đá", iron: "Mỏ sắt" } as const;
const cargoOptions = [10, 25, 50] as const;
const cargoStep = 10;
const cargoMax = 50;

export function LogisticsPanel() {
  const { state, runCommand } = useGame();
  const session = state.session!; const snapshot = state.snapshot!;
  const city = snapshot.cities.find(item => item.playerId === session.player.id) ?? snapshot.cities[0];
  const [now, setNow] = useState(Date.now());
  const [harvestAmount, setHarvestAmount] = useState<number>(25);
  const [destId, setDestId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [cargo, setCargo] = useState({ wood: 10, stone: 0, iron: 0 });
  // Per caravan, not one for the column. A single `escortId` meant picking an
  // escort in the first row silently changed the selection shown in the third,
  // and the button in row three then sent whatever row one had chosen.
  const [escortIds, setEscortIds] = useState<Record<string, string>>({});
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
  // Every gate reads the same way now: frozen first, then the rule the control is
  // about. The reasons used to go to `title=` — a tooltip nobody hovers on a
  // disabled control — and to three hand-written lines that said the same thing
  // the check already said.
  const routeBlocked = firstReason(notFrozen(city), routeReady(depot, destId));
  const caravanBlocked = firstReason(notFrozen(city), caravanReady(depot, city, cargo));
  const anchor = usePanelAnchor<HTMLElement>("logistics");

  return <Panel accent="teal" className="logistics-panel" panelRef={anchor} aria-label={"Kinh tế & vận tải"}>
    <PanelHeader title={<><Icon name="caravan" size="sm" /> Kinh tế & vận tải</>} />
    <PanelBody>
      <div className="logistics-block">
        <h3>Mỏ tài nguyên</h3>
        <p className="kom-meta">Khai thác đưa tài nguyên về kho thành phố — mỏ hồi phục dần theo thời gian.</p>
        <label className="kom-meta">Lượng khai thác:
          <select value={harvestAmount} onChange={event => setHarvestAmount(Number(event.target.value))}>{cargoOptions.map(option => <option value={option} key={option}>{option}</option>)}</select>
        </label>
        <div className="node-list">
          {snapshot.logistics.resourceNodes.slice(0, 8).map(node => {
            const reason = firstReason(notFrozen(city), harvestReady(node, harvestAmount));
            return <div className="node-row" key={node.id}>
              <span><strong>{nodeNames[node.resourceType]}</strong> ({node.x},{node.y})</span>
              <span className="kom-meta kom-num">{node.remaining}/{node.capacity}</span>
              <div className="row-actions">
                <Button
                  density="compact"
                  disabled={Boolean(reason)}
                  reason={reason}
                  onClick={() => runCommand({ kind: "harvest", label: "Khai thác tài nguyên", path: "/api/commands/harvest", body: { nodeId: node.id, cityId: city.id, amount: harvestAmount } }).catch(() => undefined)}
                >Khai thác</Button>
                <PendingChip kind="harvest" match={{ nodeId: node.id }} />
              </div>
            </div>;
          })}
        </div>
      </div>

      <div className="logistics-block">
        <h3>Tuyến vận tải</h3>
        <p className="kom-meta">Cần trạm tiếp tế trước khi lập tuyến. Kho tăng sức chứa cho các chuyến.</p>
        <div className="route-creator">
          <p className="kom-meta">Tuyến vận tải trong alpha chỉ đến chợ (thành phố → thành phố sẽ mở khi có nhiều thành phố mỗi người chơi).</p>
          <select value={destId} onChange={event => setDestId(event.target.value)} aria-label="Điểm đến">
            <option value="">Chọn điểm đến…</option>
            {marketHubs.map(hub => <option value={hub.id} key={hub.id}>{hub.name}</option>)}
          </select>
          <Button
            disabled={Boolean(routeBlocked)}
            reason={routeBlocked}
            onClick={() => runCommand({ kind: "route", label: "Lập tuyến vận tải", path: "/api/commands/routes", body: { sourceCityId: city.id, destinationKind: "market", destinationId: destId } }).then(() => setDestId("")).catch(() => undefined)}
          >Lập tuyến</Button>
          <PendingChip kind="route" match={{ sourceCityId: city.id }} />
        </div>
        {activeRoutes.length === 0 && <p className="kom-meta">Chưa có tuyến nào.</p>}
        {activeRoutes.map(route => {
          const target = route.destinationKind === "market" ? (marketHubs.find(hub => hub.id === route.destinationMarketId)?.name ?? "Thương cảng") : sourceName(route.destinationCityId ?? "");
          return <div className="route-row" data-testid="route-row" key={route.id}>
            <span>{sourceName(route.sourceCityId)} → {target} ({route.distance} ô, {Math.ceil(route.travelTimeSeconds / 60)} phút)</span>
            <Button variant="ghost" density="compact" aria-pressed={routeId === route.id} onClick={() => setRouteId(route.id)}>{routeId === route.id ? "✓ đã chọn" : "Chọn gửi hàng"}</Button>
          </div>;
        })}
      </div>

      {routeId && (
        <div className="logistics-block cargo-editor" role="group" aria-label="Gửi chuyến hàng">
          <h3>Gửi chuyến hàng</h3>
          <p className="kom-meta">Xuất khẩu qua Thương cảng tính vào điểm kinh tế; hàng đến nơi sau thời gian vận chuyển.</p>
          <div className="cargo-grid">
            {(["wood", "stone", "iron"] as const).map(resource => (
              <div className="cargo-stepper" key={resource}>
                <span className="kom-meta">{resourceLabels[resource]}</span>
                <Button variant="ghost" density="compact" aria-label={`Bớt ${resourceLabels[resource]}`} onClick={() => setCargo(cargo => ({ ...cargo, [resource]: Math.max(0, cargo[resource] - cargoStep) }))}>−</Button>
                <strong className="kom-num">{cargo[resource]}</strong>
                <Button variant="ghost" density="compact" aria-label={`Thêm ${resourceLabels[resource]}`} onClick={() => setCargo(cargo => ({ ...cargo, [resource]: Math.min(cargoMax, cargo[resource] + cargoStep) }))}>+</Button>
              </div>
            ))}
          </div>
          <p className="kom-meta">Tổng hàng hóa: <span className="kom-num">{cargoTotal}</span>{depot ? <> / sức chứa <span className="kom-num">{depot.capacity}</span></> : " (cần kho để gửi)"}</p>
          <div className="row-actions">
            <Button
              variant="primary"
              disabled={Boolean(caravanBlocked)}
              reason={caravanBlocked}
              onClick={() => runCommand({ kind: "caravan", label: "Gửi caravan", path: "/api/commands/caravans", body: { routeId, cargo: { ...cargo, food: 0 } } }).then(() => setRouteId("")).catch(() => undefined)}
            >Gửi caravan</Button>
            <PendingChip kind="caravan" match={{ routeId }} />
          </div>
        </div>
      )}

      <div className="logistics-block">
        <h3>Caravan đang chạy</h3>
        {activeCaravans.length === 0 && <p className="kom-meta">Không có caravan nào đang di chuyển.</p>}
        {activeCaravans.map(caravan => {
          const escortId = escortIds[caravan.id] ?? "";
          return <div className="caravan-row" data-testid="caravan-row" key={caravan.id}>
            <div>
              <span>{sourceName(caravan.sourceCityId)} → {destinationName(caravan)}</span>
              <span className="kom-meta"> <span className="kom-num">{Math.round(caravan.progress * 100)}%</span> · còn {caravan.arrivesAt ? countdown(caravan.arrivesAt) : "…"}{caravan.cargo ? ` · hàng ${formatCargo(caravan.cargo)}` : ""}</span>
            </div>
            {!caravan.escortArmyId && myArmies.length > 0 && (
              <div className="escort-row">
                <select value={escortId} onChange={event => setEscortIds(current => ({ ...current, [caravan.id]: event.target.value }))} aria-label="Quân hộ tống">
                  <option value="">Chọn quân hộ tống…</option>
                  {myArmies.map(army => <option value={army.id} key={army.id}>QĐ {gameRules.recruitment[army.unitType as keyof typeof gameRules.recruitment].name} ({army.strength})</option>)}
                </select>
                <Button
                  density="compact"
                  disabled={!escortId}
                  reason="Chọn một quân hộ tống trước."
                  onClick={() => runCommand({ kind: "escort", label: "Hộ tống caravan", path: "/api/commands/escort", body: { caravanId: caravan.id, armyId: escortId } }).catch(() => undefined)}
                >Hộ tống</Button>
                <PendingChip kind="escort" match={{ caravanId: caravan.id }} />
              </div>
            )}
          </div>;
        })}
      </div>

      <div className="logistics-block export-note">
        <h3>Xuất khẩu là gì?</h3>
        <p className="kom-meta">Lập tuyến đến <strong>{markupHubName(marketHubs)}</strong> và gửi caravan. Khi hàng cập bến, lượng gỗ/đá/sắt được tính là xuất khẩu — góp vào điểm kinh tế và mục tiêu “Đã xuất khẩu” trong phần giới thiệu. Bọn cướp có thể phục kích trên đường: cử quân hộ tống đem theo caravan để bảo vệ.</p>
      </div>
    </PanelBody>
  </Panel>;
}

function markupHubName(hubs: { name: string }[]): string { return hubs[0]?.name ?? gameRules.market.name; }
