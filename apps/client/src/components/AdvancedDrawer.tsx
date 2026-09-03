import { useEffect, useState } from "react";
import type { SeasonArchive, Treaty, TreatyType } from "@kingdoms/shared";
import * as api from "../api.js";
import { useGame } from "../state.js";
import { usePanelAnchor } from "../panel-anchors.js";
import { affordable } from "../validation.js";
import { allianceRoleLabels, treatyLabels, worldEventIcons, worldEventLabels, worldEventStates } from "../vocabulary.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";
import { Modal } from "../ui/Modal.js";
import { Panel, PanelBody, PanelHeader } from "../ui/Panel.js";
import { StatusChip } from "../ui/Status.js";
import { EspionagePanel } from "./EspionagePanel.js";

// The four surfaces behind "Nâng cao". They were the last of the thirteen still
// written as bare markup: a `<section>` with an `<h2>`, styled by `.hud section`
// and by nine rules on one line of `styles.css`, three of which reached past a
// primitive with a bare element selector (`.governance-actions button` is (0,1,1)
// and took the padding straight back off `.kom-btn--compact`). Assembling them
// from panels is what lets that bridge rule be deleted rather than described.

const countdown = (endsAt: string, now: number) => { const seconds = Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 1000)); return `${Math.floor(seconds / 60)}m ${seconds % 60}s`; };

/** Both countdowns here retick every second. Written once so two panels cannot
 *  drift into two intervals with two periods. */
function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return now;
}

/** Two server rules the client mirrors to gate a button: ten members to an
 *  alliance, and a contribution of fifty of each material. */
const allianceCap = 10;
const allianceContribution = { wood: 50, stone: 50, iron: 50 };

/** What the propose form offers. `trade_pact` is in the protocol and has a label
 *  — a row showing one that arrived from a peer is ours to render — but nothing
 *  in this UI proposes one, so an option for it would be a control for a rule the
 *  rest of the game does not implement. */
const offeredTreatyTypes = ["non_aggression", "defensive_pact"] as const satisfies readonly TreatyType[];

/** Confirm for the "-150 reputation" cost of breaking a treaty. This dialog was the
 * one that did focus trap / Escape / focus restore correctly, so `ui/Modal.tsx` is
 * its mechanism lifted out; what is left here is only the wording and the cost.
 *
 * "Hủy" is first in the action band because the band's order is the tab order and
 * the dialog's own effect focuses the first control — a stray Enter cancels
 * instead of spending 150 reputation. */
export function TreatyBreakModal({ treaty, partnerName, onConfirm, onClose }: { treaty: Treaty; partnerName: string; onConfirm: () => void; onClose: () => void }) {
  return <Modal title="Xóa hiệp ước?" onClose={onClose} actions={<>
    <Button onClick={onClose}>Hủy</Button>
    <Button variant="destructive" onClick={onConfirm}>Phá hiệp ước (−150 danh tiếng)</Button>
  </>}>
    <p>Bạn đang xóa hiệp ước <strong>{treatyLabels[treaty.treatyType]}</strong> với <strong>{partnerName}</strong>.</p>
    <p className="reputation-cost">Trừ <strong>150 điểm danh tiếng</strong> — phá hiệp ước làm mất uy tín của bạn trong khu vực và các hiệp ước khác sẽ khó được chấp nhận hơn.</p>
  </Modal>;
}

function AlliancePanel() {
  const { state, runCommand } = useGame();
  const session = state.session!; const snapshot = state.snapshot!;
  const [allianceName, setAllianceName] = useState("");
  const [allianceTag, setAllianceTag] = useState("");
  const [noticeText, setNoticeText] = useState("");
  const [voteCandidate, setVoteCandidate] = useState("");
  const now = useNow();
  const city = snapshot.cities.find(item => item.playerId === session.player.id) ?? snapshot.cities[0];
  const frozenPlayers = new Set(snapshot.cities.filter(item => item.frozen).map(item => item.playerId));
  const myAlliance = snapshot.alliances?.find(a => a.members.some(m => m.playerId === session.player.id));
  const myRole = myAlliance?.members.find(member => member.playerId === session.player.id)?.role;
  const openVote = snapshot.allianceVotes?.find(vote => vote.allianceId === myAlliance?.id && vote.status === "open");
  const nameOf = (playerId: string) => snapshot.cities.find(item => item.playerId === playerId)?.playerName ?? playerId;
  /** The same check the city panel uses for a build. A contribution is a purchase
   *  like any other, and it used to be gated by three inline comparisons that said
   *  nothing about which of the three was short. */
  const contribution = affordable(city, allianceContribution);
  const voted = openVote?.votes.some(vote => vote.playerId === session.player.id) ?? false;

  return <Panel accent="teal" className="alliance-panel" aria-label="Liên minh">
    <PanelHeader
      title={<><Icon name="banner" size="sm" /> Liên minh</>}
      meta={myAlliance ? `${myAlliance.members.length}/${allianceCap} thành viên` : undefined}
    />
    <PanelBody>
      {!myAlliance ? <>
        <div className="drawer-form">
          <div className="drawer-form__row">
            <input value={allianceName} onChange={event => setAllianceName(event.target.value)} placeholder="Tên liên minh (2-30)" maxLength={30} aria-label="Tên liên minh" />
          </div>
          <div className="drawer-form__row">
            <input value={allianceTag} onChange={event => setAllianceTag(event.target.value)} placeholder="Ký hiệu (2-5 ký tự)" maxLength={5} aria-label="Ký hiệu liên minh" />
            <Button
              variant="primary"
              disabled={allianceName.trim().length < 2 || allianceTag.trim().length < 2}
              reason="Cần một tên từ 2 ký tự và một ký hiệu từ 2 ký tự."
              onClick={() => runCommand({ kind: "alliance_create", label: "Tạo liên minh", path: "/api/commands/alliance/create", body: { name: allianceName.trim(), tag: allianceTag.trim() } }).then(() => { setAllianceName(""); setAllianceTag(""); }).catch(() => undefined)}
            >Tạo liên minh</Button>
          </div>
        </div>
        <ul className="drawer-list">
          {snapshot.alliances?.map(a => <li className="drawer-row" key={a.id}>
            <span className="drawer-row__main">
              <span>[{a.tag}] {a.name}</span>
              <span className="kom-meta"><span className="kom-num">{a.members.length}</span>/{allianceCap} thành viên</span>
            </span>
            <Button
              density="compact"
              disabled={a.members.length >= allianceCap}
              reason={`Liên minh này đã đủ ${allianceCap} thành viên.`}
              onClick={() => runCommand({ kind: "alliance_join", label: "Gia nhập liên minh", path: "/api/commands/alliance/join", body: { allianceId: a.id } }).catch(() => undefined)}
            >Gia nhập</Button>
          </li>)}
        </ul>
      </> : <>
        <h3 className="drawer-subhead">[{myAlliance.tag}] {myAlliance.name}</h3>
        {myAlliance.notice && <p className="alliance-notice">{myAlliance.notice}</p>}
        <ul className="drawer-list">
          {myAlliance.members.map(m => <li className="drawer-row" key={m.playerId}>
            <span className="drawer-row__main">
              <span>{nameOf(m.playerId)}</span>
              <span className="kom-meta">{allianceRoleLabels[m.role]} · đóng góp <span className="kom-num">{m.contribution}</span></span>
            </span>
            {myRole === "leader" && m.role !== "leader" && <>
              <Button
                density="compact"
                disabled={frozenPlayers.has(m.playerId)}
                reason="Người chơi này đang bị đóng băng."
                onClick={() => runCommand({ kind: "alliance_member", label: "Đổi vai trò", path: "/api/commands/alliance/member", body: { targetPlayerId: m.playerId, action: m.role === "officer" ? "demote" : "promote" } }).catch(() => undefined)}
              >{m.role === "officer" ? "Giáng chức" : "Thăng chức"}</Button>
              <Button
                variant="destructive"
                density="compact"
                onClick={() => runCommand({ kind: "alliance_member", label: "Kick thành viên", path: "/api/commands/alliance/member", body: { targetPlayerId: m.playerId, action: "kick" } }).catch(() => undefined)}
              >Kick</Button>
            </>}
          </li>)}
        </ul>
        <div className="drawer-form__row">
          <Button
            disabled={!contribution.ok}
            reason={contribution.reason}
            onClick={() => runCommand({ kind: "alliance_contribute", label: "Đóng góp cho liên minh", path: "/api/commands/alliance/contribute", body: { cityId: city.id, resources: allianceContribution } }).catch(() => undefined)}
          >Đóng góp 50 nguyên liệu</Button>
          <Button
            onClick={() => runCommand({ kind: "alliance_leave", label: "Rời liên minh", path: "/api/commands/alliance/leave", body: {} }).catch(() => undefined)}
          >Rời liên minh</Button>
        </div>
        {(myRole === "leader" || myRole === "officer") && <div className="drawer-form">
          <div className="drawer-form__row">
            <input value={noticeText} onChange={event => setNoticeText(event.target.value)} placeholder="Thông báo liên minh (≤200)" maxLength={200} aria-label="Thông báo liên minh" />
            <Button
              density="compact"
              disabled={!noticeText.trim()}
              reason="Nhập nội dung thông báo trước đã."
              onClick={() => runCommand({ kind: "alliance_notice", label: "Đặt thông báo", path: "/api/commands/alliance/notice", body: { notice: noticeText.trim() } }).then(() => setNoticeText("")).catch(() => undefined)}
            >Đặt thông báo</Button>
          </div>
          <div className="drawer-form__row">
            <select value={voteCandidate} onChange={event => setVoteCandidate(event.target.value)} aria-label="Ứng viên lãnh đạo">
              <option value="">Chọn ứng viên…</option>
              {myAlliance.members.filter(m => m.playerId !== session.player.id).map(m => <option value={m.playerId} key={m.playerId}>{nameOf(m.playerId)} ({allianceRoleLabels[m.role]})</option>)}
            </select>
            <Button
              density="compact"
              disabled={!voteCandidate}
              reason="Chọn một ứng viên trước đã."
              onClick={() => runCommand({ kind: "alliance_vote_open", label: "Mở bỏ phiếu lãnh đạo", path: "/api/commands/alliance/vote/open", body: { candidatePlayerId: voteCandidate } }).then(() => setVoteCandidate("")).catch(() => undefined)}
            >Mở bỏ phiếu lãnh đạo</Button>
          </div>
        </div>}
        {openVote && <div className="drawer-row">
          <span className="drawer-row__main">
            <strong>Bỏ phiếu lãnh đạo</strong>
            <span className="kom-meta">Ứng viên: {nameOf(openVote.candidatePlayerId)} · còn <span className="kom-num">{countdown(openVote.expiresAt, now)}</span></span>
          </span>
          {/* One reason under each of the two, because each is its own gate: the
              scan in `ui-primitives.test.ts` reads one tag at a time, and a player
              who tabs to the second button is owed the sentence too. */}
          <Button
            variant="primary"
            density="compact"
            disabled={voted}
            reason="Bạn đã bỏ phiếu — mỗi người một phiếu."
            onClick={() => runCommand({ kind: "alliance_vote_cast", label: "Bỏ phiếu ủng hộ", path: "/api/commands/alliance/vote/cast", body: { voteId: openVote.id, vote: true } }).catch(() => undefined)}
          >Đồng ý</Button>
          <Button
            density="compact"
            disabled={voted}
            reason="Bạn đã bỏ phiếu — mỗi người một phiếu."
            onClick={() => runCommand({ kind: "alliance_vote_cast", label: "Bỏ phiếu phản đối", path: "/api/commands/alliance/vote/cast", body: { voteId: openVote.id, vote: false } }).catch(() => undefined)}
          >Phản đối</Button>
        </div>}
      </>}
    </PanelBody>
  </Panel>;
}

function EventsPanel() {
  const { state } = useGame();
  const snapshot = state.snapshot!;
  const now = useNow();
  const invaders = (eventId: string) => snapshot.armies.filter(army => army.sourceWorldEventId === eventId).length;

  return <Panel accent="amber" className="events-panel" aria-label="Sự kiện thế giới">
    <PanelHeader title={<><Icon name="alert" size="sm" /> Sự kiện thế giới</>} />
    <PanelBody>
      {snapshot.worldEvents?.length ? <ul className="drawer-list">
        {snapshot.worldEvents.map(event => <li className="drawer-row" data-testid="world-event" key={event.id}>
          <span className="drawer-row__main">
            <span><Icon name={worldEventIcons[event.eventType]} size="sm" /> {worldEventLabels[event.eventType]}</span>
            <span className="kom-meta">
              Mức độ <span className="kom-num">{event.severity}</span> · còn <span className="kom-num">{countdown(event.endsAt, now)}</span>
              {event.eventType === "mob_migration" && <> · <span className="kom-num">{invaders(event.id)}</span> bọn xâm lược</>}
            </span>
          </span>
          <StatusChip state={worldEventStates[event.eventType]} />
        </li>)}
      </ul> : <p className="kom-meta">Chưa có sự kiện đang diễn ra.</p>}
    </PanelBody>
  </Panel>;
}

function ArchivePanel() {
  const { state, addNotice } = useGame();
  const session = state.session!;
  const [archive, setArchive] = useState<SeasonArchive>();

  return <Panel accent="slate" className="archive-panel" aria-label="Lịch sử mùa">
    <PanelHeader title={<><Icon name="clock" size="sm" /> Lịch sử mùa</>} actions={<Button
      density="compact"
      onClick={() => api.seasonHistory(session.token).then(setArchive).catch(error => addNotice(error instanceof Error ? error.message : "Không tải được lịch sử mùa."))}
    >Nạp lịch sử mùa</Button>} />
    <PanelBody>
      {archive ? <>
        {archive.profile.badge && <p><strong>{archive.profile.badge}</strong></p>}
        <p className="kom-meta">{archive.profile.title ?? "Chưa có danh hiệu"} · Danh tiếng <span className="kom-num">{archive.profile.crossSeasonReputation}</span>{archive.profile.crown && " · 👑"}</p>
        <div className="archive-content">
          {archive.seasons.map((season, index) => <details className="archive-season" data-testid="archive-season" key={season.seasonId}>
            <summary>Mùa {archive.seasons.length - index} · đóng {new Date(season.closedAt).toLocaleDateString()} · {season.rankings.length} người chơi</summary>
            {season.rankings.map(row => <div className="archive-rank" key={row.playerId}>#{row.rank} {row.displayName}: <span className="kom-num">{row.overall}</span></div>)}
          </details>)}
        </div>
      </> : <p className="kom-meta">Chưa nạp lịch sử mùa nào.</p>}
    </PanelBody>
  </Panel>;
}

/** The heading skip this closes was `h2` → `h4`: the panel's own title was an
 *  `<h2>` and its three groups jumped straight to `<h4>` because `<h3>` rendered
 *  too large. `PanelHeader` owns the h2 now, the groups are `<h3>`, and the size
 *  is `.drawer-subhead`'s business rather than the outline's. */
function DiplomacyPanel() {
  const { state, runCommand } = useGame();
  const session = state.session!; const snapshot = state.snapshot!;
  const [breaking, setBreaking] = useState<Treaty | undefined>();
  const [treatyTarget, setTreatyTarget] = useState("");
  const [treatyType, setTreatyType] = useState<TreatyType>("non_aggression");
  const frozenPlayers = new Set(snapshot.cities.filter(item => item.frozen).map(item => item.playerId));
  const otherPlayers = Object.keys(snapshot.scores).filter(id => id !== session.player.id && !frozenPlayers.has(id)).map(id => ({ id, displayName: snapshot.cities.find(c => c.playerId === id)?.playerName ?? id }));
  const myTreaties = snapshot.treaties?.filter(t => t.proposerPlayerId === session.player.id || t.targetPlayerId === session.player.id) ?? [];
  const pendingTreaties = myTreaties.filter(t => t.status === "proposed" && t.targetPlayerId === session.player.id);
  const activeTreaties = myTreaties.filter(t => t.status === "active");
  const playerName = (playerId: string) => snapshot.cities.find(c => c.playerId === playerId)?.playerName ?? playerId;
  const anchor = usePanelAnchor<HTMLElement>("diplomacy");

  return <Panel accent="brass" className="diplomacy-panel" panelRef={anchor} aria-label="Ngoại giao">
    <PanelHeader
      title={<><Icon name="treaty" size="sm" /> Ngoại giao</>}
      meta={activeTreaties.length > 0 ? `${activeTreaties.length} hiệp ước đang có hiệu lực` : undefined}
    />
    <PanelBody>
      {pendingTreaties.length > 0 && <>
        <h3 className="drawer-subhead">Lời đề nghị đang chờ</h3>
        <ul className="drawer-list">
          {pendingTreaties.map(t => <li className="drawer-row" data-testid="treaty-proposal" key={t.id}>
            <span className="drawer-row__main">{playerName(t.proposerPlayerId)} đề nghị hiệp ước <strong>{treatyLabels[t.treatyType]}</strong></span>
            <Button
              variant="primary"
              density="compact"
              onClick={() => runCommand({ kind: "treaty_respond", label: "Chấp nhận hiệp ước", path: "/api/commands/treaty/respond", body: { treatyId: t.id, accept: true } }).catch(() => undefined)}
            >Chấp nhận</Button>
            <Button
              density="compact"
              onClick={() => runCommand({ kind: "treaty_respond", label: "Từ chối hiệp ước", path: "/api/commands/treaty/respond", body: { treatyId: t.id, accept: false } }).catch(() => undefined)}
            >Từ chối</Button>
          </li>)}
        </ul>
      </>}
      {activeTreaties.length > 0 && <>
        <h3 className="drawer-subhead">Hiệp ước đang có hiệu lực</h3>
        <ul className="drawer-list">
          {activeTreaties.map(t => {
            const partnerId = t.proposerPlayerId === session.player.id ? t.targetPlayerId : t.proposerPlayerId;
            return <li className="drawer-row" data-testid="treaty-active" key={t.id}>
              <span className="drawer-row__main">Hiệp ước <strong>{treatyLabels[t.treatyType]}</strong> với {playerName(partnerId)}</span>
              <Button variant="destructive" density="compact" onClick={() => setBreaking(t)}>Phá hiệp ước</Button>
            </li>;
          })}
        </ul>
      </>}
      <h3 className="drawer-subhead">Đề nghị hiệp ước</h3>
      <div className="drawer-form__row">
        <select value={treatyTarget} onChange={event => setTreatyTarget(event.target.value)} aria-label="Người chơi nhận đề nghị">
          <option value="">Chọn người chơi…</option>
          {otherPlayers.map(p => <option value={p.id} key={p.id}>{p.displayName}</option>)}
        </select>
        <select value={treatyType} onChange={event => setTreatyType(event.target.value as TreatyType)} aria-label="Loại hiệp ước">
          {offeredTreatyTypes.map(type => <option value={type} key={type}>Hiệp ước {treatyLabels[type].toLowerCase()}</option>)}
        </select>
        <Button
          variant="primary"
          density="compact"
          disabled={!treatyTarget}
          reason="Chọn người chơi nhận đề nghị trước đã."
          onClick={() => runCommand({ kind: "treaty_propose", label: "Đề nghị hiệp ước", path: "/api/commands/treaty/propose", body: { targetPlayerId: treatyTarget, treatyType } }).then(() => setTreatyTarget("")).catch(() => undefined)}
        >Gửi đề nghị</Button>
      </div>
      {breaking && <TreatyBreakModal
        treaty={breaking}
        partnerName={playerName(breaking.proposerPlayerId === session.player.id ? breaking.targetPlayerId : breaking.proposerPlayerId)}
        onConfirm={() => { const id = breaking.id; setBreaking(undefined); runCommand({ kind: "treaty_break", label: "Phá hiệp ước", path: "/api/commands/treaty/break", body: { treatyId: id } }).catch(() => undefined); }}
        onClose={() => setBreaking(undefined)}
      />}
    </PanelBody>
  </Panel>;
}

/** Order is deliberate and unchanged: alliance first because it is the surface a
 *  player opens the drawer for, diplomacy last because it is the one that can
 *  spend 150 reputation. `EspionagePanel` was migrated a round earlier and needed
 *  no edit this time — evidence the primitive shape is the same for all five. */
export default function AdvancedDrawer() {
  return <div className="advanced-drawer">
    <AlliancePanel />
    <EspionagePanel />
    <EventsPanel />
    <ArchivePanel />
    <DiplomacyPanel />
  </div>;
}
