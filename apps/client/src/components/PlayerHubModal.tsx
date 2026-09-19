import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CosmeticSlot, PlayerHub } from "@kingdoms/shared";
import * as api from "../api.js";
import { useGame } from "../state.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";
import { Modal } from "../ui/Modal.js";
import { ProgressMeter } from "../ui/ProgressMeter.js";
import {
  hubTabs, reputationMeter, rewardProgress, scoreMeters, slotIcons, slotLabels, slotPreviewClass,
} from "./hub-view.js";

type HubMode = "profile" | "inventory" | "shop";

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

  // The visualisation set: numbers become rings with a glyph in the hollow,
  // names keep their meaning through `aria-label` and `title` instead of a
  // caption under every element. The eye reads less; a screen reader is read
  // the same sentences as before.
  const meters = hub ? scoreMeters(hub.profile.scores) : undefined;
  const reputation = hub ? reputationMeter(hub.profile.crossSeasonReputation) : undefined;
  const modalTitle = tab === "profile" ? "Hồ sơ chỉ huy" : tab === "shop" ? "Shop cosmetic" : "Túi cosmetic";

  return <Modal title={modalTitle} onClose={onClose} className="player-hub-modal">
    <div className="hub-tabs" role="tablist" aria-label="Hub người chơi">
      {hubTabs.map(entry => <Button key={entry.id} variant={tab === entry.id ? "secondary" : "ghost"} density="compact" role="tab" aria-selected={tab === entry.id} onClick={() => setTab(entry.id)}><Icon name={entry.icon} size="sm" /><span>{entry.label}</span></Button>)}
    </div>
    {loading && !hub ? <p role="status">Dang tai du lieu hub...</p> : hub && meters && reputation ? <>
      <div className="hub-wallet"><Icon name="banner" size="sm" /><strong className="kom-num">{hub.wallet.badges}</strong><span>{hub.currencyLabel}</span></div>
      {tab === "profile" && <section className="hub-profile" aria-label="Thông tin hồ sơ">
        <div className="hub-profile__head">
          <div className={`hub-profile-crest hub-profile-crest--${hub.equipped.avatar_frame ?? "default"}`}>{hub.profile.displayName.slice(0, 1).toUpperCase()}</div>
          <div><h3>{hub.profile.displayName}</h3><p>{hub.profile.factionId} {hub.profile.title ? `– ${hub.profile.title}` : ""}</p></div>
        </div>
        <div className="hub-meters">
          {meters.map(meter => <div className="hub-meter" key={meter.key}>
            <ProgressMeter fraction={meter.fraction} icon={meter.icon} label={`${meter.label} ${meter.value} trên 1000`} />
            <span className="kom-num" aria-hidden="true">{meter.value}</span>
          </div>)}
          <div className="hub-meter hub-meter--reputation">
            <ProgressMeter fraction={reputation.fraction} icon="star" label={`Danh tiếng mùa ${hub.profile.crossSeasonReputation}, hạng ${reputation.rank}`} />
            <span aria-hidden="true">Hạng <span className="kom-num">{reputation.rank}</span></span>
          </div>
        </div>
      </section>}
      {tab === "shop" && <section className="hub-catalog" aria-label="Catalog cosmetic">
        {hub.catalog.map(item => <article className="hub-item" key={item.id}>
          <div className={slotPreviewClass(item.slot, item.preview)} aria-hidden="true"><Icon name={slotIcons[item.slot]} size="md" /></div>
          <div className="hub-item__copy">
            <h3 title={item.description}>{item.name}</h3>
            <strong className="kom-num" title={`${item.price} ${hub.currencyLabel}`}><Icon name="coin" size="sm" /> {item.price}</strong>
          </div>
          <Button variant="primary" density="compact" disabled={owned.has(item.id) || hub.wallet.badges < item.price} reason={owned.has(item.id) ? "Đã sở hữu" : hub.wallet.badges < item.price ? "Không đủ Huy hiệu" : undefined} onClick={() => buy(item.id)}>{owned.has(item.id) ? "Đã sở hữu" : "Mua"}</Button>
        </article>)}
      </section>}
      {tab === "inventory" && <section className="hub-inventory" aria-label="Túi cosmetic">
        {/* `catalog` is versioned; `owned` survives a version change. An owned
            item the current catalog no longer lists must not take the whole
            dialog down with it — it just stops rendering until the catalog
            catches up. */}
        {(Object.keys(slotIcons) as CosmeticSlot[]).map(slot => { const equipped = hub.equipped[slot]; const items = hub.owned.flatMap(ownedItem => { const item = hub.catalog.find(candidate => candidate.id === ownedItem.itemId); return item?.slot === slot ? [item] : []; }); return <div className="hub-slot" key={slot}>
          <h3><Icon name={slotIcons[slot]} size="sm" /> {slotLabels[slot]}</h3>
          {items.length === 0 ? <p>Chưa có vật phẩm.</p> : items.map(item => { const isEquipped = equipped === item.id; return <div className={isEquipped ? "hub-owned hub-owned--equipped" : "hub-owned"} key={item.id}>
            <div className={slotPreviewClass(slot, item.preview)} aria-hidden="true"><Icon name={slotIcons[slot]} size="sm" /></div>
            <span>{item.name}</span>
            {isEquipped && <Icon name="check" size="sm" title="Đang dùng" />}
            <Button variant={isEquipped ? "secondary" : "ghost"} density="compact" onClick={() => equip(slot, isEquipped ? null : item.id)}>{isEquipped ? "Gỡ" : "Dùng"}</Button>
          </div>; })}
        </div>; })}
        <div className="hub-rewards"><h3><Icon name="gem" size="sm" /> Phần thưởng</h3>{hub.rewards.map(reward => <div className={reward.claimed ? "hub-reward hub-reward--claimed" : "hub-reward"} key={reward.id}>
          <ProgressMeter fraction={rewardProgress(reward)} icon="gem" size="sm" label={`${reward.title}, thưởng ${reward.amount} ${hub.currencyLabel}${reward.claimed ? ", đã nhận" : reward.eligible ? ", sẵn sàng nhận" : ", chưa hoàn thành"}`} />
          <span>{reward.title} <strong className="kom-num">+{reward.amount}</strong></span>
          <Button variant="primary" density="compact" disabled={!reward.eligible || reward.claimed} reason={reward.claimed ? "Đã nhận" : !reward.eligible ? "Chưa hoàn thành" : undefined} onClick={() => claim(reward.id)}>{reward.claimed ? "Đã nhận" : "Nhận"}</Button>
        </div>)}</div>
      </section>}
    </> : <p role="alert">Khong co du lieu hub.</p>}
  </Modal>;
}

export type { HubMode };
