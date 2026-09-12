import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CosmeticSlot, PlayerHub } from "@kingdoms/shared";
import * as api from "../api.js";
import { useGame } from "../state.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";
import { Modal } from "../ui/Modal.js";

type HubMode = "profile" | "inventory" | "shop";
const slotLabels: Record<CosmeticSlot, string> = { avatar_frame: "Khung", flag_color: "Cờ", nameplate: "Bảng tên" };

export function PlayerHubModal({ mode, onClose }: { mode: HubMode; onClose: () => void }) {
  const { state, connection, runCommand, addNotice, playerHub, setPlayerHub } = useGame();
  const scoreEvidenceSent = useRef(false);
  const [hub, setHub] = useState<PlayerHub | undefined>(playerHub);
  const [tab, setTab] = useState<HubMode>(mode);
  const [loading, setLoading] = useState(true);
  const lastConnection = useRef(connection);
  const refreshInFlight = useRef(false);
  const token = state.session?.token;

  const refresh = useCallback(() => {
    if (!token || refreshInFlight.current) return;
    refreshInFlight.current = true;
    setLoading(true);
    void api.playerHub(token).then(next => { setHub(next); setPlayerHub(next); }).catch(error => addNotice(error instanceof Error ? error.message : "Không tải được hub.")).finally(() => { refreshInFlight.current = false; setLoading(false); });
  }, [addNotice, setPlayerHub, token]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const previous = lastConnection.current;
    lastConnection.current = connection;
    if (connection === "online" && previous !== "online") refresh();
  }, [connection, refresh]);
  useEffect(() => { if (playerHub) setHub(playerHub); }, [playerHub]);
  useEffect(() => {
    if (tab !== "profile" || !hub || scoreEvidenceSent.current) return;
    if (state.snapshot?.onboarding?.completedSteps.includes("score_viewed")) return;
    scoreEvidenceSent.current = true;
    void runCommand({ kind: "onboarding_ack", label: "Đã xem điểm mùa", path: "/api/commands/onboarding/ack", body: { step: "score_viewed" } }).catch(() => { scoreEvidenceSent.current = false; });
  }, [hub, runCommand, state.snapshot?.onboarding?.completedSteps, tab]);

  const owned = useMemo(() => new Set(hub?.owned.map(item => item.itemId) ?? []), [hub]);
  const buy = (itemId: string) => {
    void runCommand({ kind: "cosmetics_purchase", label: "Mua cosmetic", path: "/api/commands/cosmetics/purchase", body: { itemId } })
      .then(response => { if (response.data) { setHub(response.data as PlayerHub); setPlayerHub(response.data as PlayerHub); } }).catch(() => undefined);
  };
  const claim = (rewardId: string) => {
    void runCommand({ kind: "cosmetics_claim", label: "Nhận Huy hiệu", path: "/api/commands/cosmetics/claim", body: { rewardId } })
      .then(response => { if (response.data) { setHub(response.data as PlayerHub); setPlayerHub(response.data as PlayerHub); } }).catch(() => undefined);
  };
  const equip = (slot: CosmeticSlot, itemId: string | null) => {
    void runCommand({ kind: "cosmetics_equip", label: "Trang bị cosmetic", path: "/api/commands/cosmetics/equip", body: { slot, itemId } })
      .then(response => { if (response.data) { setHub(response.data as PlayerHub); setPlayerHub(response.data as PlayerHub); } }).catch(() => undefined);
  };

  return <Modal title={tab === "profile" ? "Hồ sơ chỉ huy" : tab === "shop" ? "Shop cosmetic" : "Túi cosmetic"} onClose={onClose} className="player-hub-modal">
    <div className="hub-tabs" role="tablist" aria-label="Hub người chơi">
      {(["profile", "inventory", "shop"] as HubMode[]).map(item => <Button key={item} variant={tab === item ? "secondary" : "ghost"} density="compact" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item === "profile" ? "Hồ sơ" : item === "inventory" ? "Túi" : "Shop"}</Button>)}
    </div>
    {loading && !hub ? <p role="status">Dang tai du lieu hub...</p> : hub ? <>
      <div className="hub-wallet"><Icon name="banner" size="sm" /><strong className="kom-num">{hub.wallet.badges}</strong><span>{hub.currencyLabel}</span></div>
      {tab === "profile" && <section className="hub-profile" aria-label="Thông tin hồ sơ">
        <div className={`hub-profile-crest hub-profile-crest--${hub.equipped.avatar_frame ?? "default"}`}>{hub.profile.displayName.slice(0, 1).toUpperCase()}</div>
        <div><h3>{hub.profile.displayName}</h3><p>{hub.profile.factionId} {hub.profile.title ? `– ${hub.profile.title}` : ""}</p></div>
        <div className="hub-score-grid">{Object.entries(hub.profile.scores).map(([key, value]) => <span key={key}><small>{key}</small><strong className="kom-num">{value}</strong></span>)}</div>
        <p>Danh tiếng mùa: <strong className="kom-num">{hub.profile.crossSeasonReputation}</strong></p>
      </section>}
      {tab === "shop" && <section className="hub-catalog" aria-label="Catalog cosmetic">
        {hub.catalog.map(item => <article className="hub-item" key={item.id}><div className={`hub-preview ${item.preview}`} aria-hidden="true"><Icon name={item.slot === "nameplate" ? "banner" : item.slot === "flag_color" ? "city" : "sword"} size="md" /></div><div><h3>{item.name}</h3><p>{item.description}</p><strong className="kom-num">{item.price} Huy hiệu</strong></div><Button variant="primary" density="compact" disabled={owned.has(item.id) || hub.wallet.badges < item.price} reason={owned.has(item.id) ? "Đã sở hữu" : hub.wallet.badges < item.price ? "Không đủ Huy hiệu" : undefined} onClick={() => buy(item.id)}>{owned.has(item.id) ? "Đã sở hữu" : "Mua"}</Button></article>)}
      </section>}
      {tab === "inventory" && <section className="hub-inventory" aria-label="Tui cosmetic">
        {(Object.keys(slotLabels) as CosmeticSlot[]).map(slot => { const equipped = hub.equipped[slot]; const items = hub.owned.filter(item => hub.catalog.find(candidate => candidate.id === item.itemId)?.slot === slot); return <div className="hub-slot" key={slot}><h3>{slotLabels[slot]}</h3>{items.length === 0 ? <p>Chưa có vật phẩm.</p> : items.map(ownedItem => { const item = hub.catalog.find(candidate => candidate.id === ownedItem.itemId)!; return <div className="hub-owned" key={item.id}><span>{item.name}</span><Button variant={equipped === item.id ? "secondary" : "ghost"} density="compact" onClick={() => equip(slot, equipped === item.id ? null : item.id)}>{equipped === item.id ? "Đang dùng" : "Trang bị"}</Button></div>; })}</div>; })}
        <div className="hub-rewards"><h3>Phần thưởng</h3>{hub.rewards.map(reward => <div className="hub-owned" key={reward.id}><span>{reward.title} <strong className="kom-num">+{reward.amount}</strong></span><Button variant="primary" density="compact" disabled={!reward.eligible || reward.claimed} reason={reward.claimed ? "Đã nhận" : !reward.eligible ? "Chưa hoàn thành" : undefined} onClick={() => claim(reward.id)}>{reward.claimed ? "Đã nhận" : "Nhận"}</Button></div>)}</div>
      </section>}
    </> : <p role="alert">Khong co du lieu hub.</p>}
  </Modal>;
}

export type { HubMode };
