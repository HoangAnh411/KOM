import { useEffect, useRef, useState } from "react";
import type { SeasonArchive, Treaty } from "@kingdoms/shared";
import * as api from "../api.js";
import { useGame } from "../state.js";
import { usePanelAnchor } from "../panel-anchors.js";
import { EspionagePanel } from "./EspionagePanel.js";

const countdown = (endsAt: string, now: number) => { const seconds = Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 1000)); return `${Math.floor(seconds / 60)}m ${seconds % 60}s`; };

/** Confirm for the "-150 reputation" cost of breaking a treaty: focus-trapped
 * dialog with Escape-to-cancel, replacing the old native confirm(). */
export function TreatyBreakModal({ treaty, partnerName, onConfirm, onClose }: { treaty: Treaty; partnerName: string; onConfirm: () => void; onClose: () => void }) {
  const card = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const focusedRef = useRef<HTMLElement | undefined>();
  useEffect(() => {
    focusedRef.current = document.activeElement as HTMLElement;
    cancelButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !card.current) return;
      const focusable = Array.from(card.current.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"));
      if (focusable.length === 0) return;
      const firstEl = focusable[0]; const lastEl = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstEl) { event.preventDefault(); lastEl.focus(); }
      else if (!event.shiftKey && document.activeElement === lastEl) { event.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); focusedRef.current?.focus?.(); };
  }, [onClose]);
  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal-card treaty-break-modal" role="dialog" aria-modal="true" aria-label="Xóa hiệp ước" ref={card} onClick={event => event.stopPropagation()}>
      <h2>Xóa hiệp ước?</h2>
      <p>Bạn đang xóa hiệp ước <strong>{treaty.treatyType}</strong> với <strong>{partnerName}</strong>.</p>
      <p className="reputation-cost">Trừ <strong>150 điểm danh tiếng</strong> — phá hiệp ước làm mất uy tín của bạn trong khu vực và các hiệp ước khác sẽ khó được chấp nhận hơn.</p>
      <div className="modal-actions">
        <button autoFocus ref={cancelButton} onClick={onClose}>Hủy</button>
        <button className="destructive" onClick={onConfirm}>Phá hiệp ước (−150 danh tiếng)</button>
      </div>
    </div>
  </div>;
}

function AlliancePanel() {
  const { state, runCommand } = useGame();
  const session = state.session!; const snapshot = state.snapshot!;
  const [allianceName, setAllianceName] = useState("");
  const [allianceTag, setAllianceTag] = useState("");
  const [noticeText, setNoticeText] = useState("");
  const [voteCandidate, setVoteCandidate] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const city = snapshot.cities.find(item => item.playerId === session.player.id) ?? snapshot.cities[0];
  const frozenPlayers = new Set(snapshot.cities.filter(item => item.frozen).map(item => item.playerId));
  const myAlliance = snapshot.alliances?.find(a => a.members.some(m => m.playerId === session.player.id));
  const myRole = myAlliance?.members.find(member => member.playerId === session.player.id)?.role;
  const openVote = snapshot.allianceVotes?.find(vote => vote.allianceId === myAlliance?.id && vote.status === "open");

  return <section className="alliance-panel" aria-label="Liên minh">
    <h2>Liên minh</h2>
    {!myAlliance ? (
      <div className="alliance-create">
        <input value={allianceName} onChange={event => setAllianceName(event.target.value)} placeholder="Tên liên minh (2-30)" maxLength={30} aria-label="Tên liên minh" />
        <input value={allianceTag} onChange={event => setAllianceTag(event.target.value)} placeholder="Ký hiệu (2-5 ký tự)" maxLength={5} aria-label="Ký hiệu liên minh" />
        <button disabled={allianceName.trim().length < 2 || allianceTag.trim().length < 2} onClick={() => runCommand({ kind: "alliance_create", label: "Tạo liên minh", path: "/api/commands/alliance/create", body: { name: allianceName.trim(), tag: allianceTag.trim() } }).then(() => { setAllianceName(""); setAllianceTag(""); }).catch(() => undefined)}>Tạo liên minh</button>
        {snapshot.alliances?.map(a => (
          <div className="alliance-row" key={a.id}>
            <span>[{a.tag}] {a.name} ({a.members.length}/10)</span>
            <button disabled={a.members.length >= 10} onClick={() => runCommand({ kind: "alliance_join", label: "Gia nhập liên minh", path: "/api/commands/alliance/join", body: { allianceId: a.id } }).catch(() => undefined)}>Gia nhập</button>
          </div>
        ))}
      </div>
    ) : (
      <div className="alliance-detail">
        <h3>[{myAlliance.tag}] {myAlliance.name}</h3>
        {myAlliance.notice && <p className="alliance-notice">{myAlliance.notice}</p>}
        <p>Thành viên: {myAlliance.members.length}/10</p>
        <ul className="member-list">
          {myAlliance.members.map(m => (
            <li key={m.playerId}>
              <span>{(snapshot.cities.find(c => c.playerId === m.playerId)?.playerName ?? m.playerId)} ({m.role}) · đóng góp {m.contribution}</span>
              {myRole === "leader" && m.role !== "leader" && <span className="member-actions"> <button disabled={frozenPlayers.has(m.playerId)} onClick={() => runCommand({ kind: "alliance_member", label: "Đổi vai trò", path: "/api/commands/alliance/member", body: { targetPlayerId: m.playerId, action: m.role === "officer" ? "demote" : "promote" } }).catch(() => undefined)}>{m.role === "officer" ? "Giáng chức" : "Thăng chức"}</button> <button onClick={() => runCommand({ kind: "alliance_member", label: "Kick thành viên", path: "/api/commands/alliance/member", body: { targetPlayerId: m.playerId, action: "kick" } }).catch(() => undefined)}>Kick</button></span>}
            </li>
          ))}
        </ul>
        <div className="alliance-actions">
          <button disabled={city.resources.wood < 50 || city.resources.stone < 50 || city.resources.iron < 50} onClick={() => runCommand({ kind: "alliance_contribute", label: "Đóng góp cho liên minh", path: "/api/commands/alliance/contribute", body: { cityId: city.id, resources: { wood: 50, stone: 50, iron: 50 } } }).catch(() => undefined)}>Đóng góp 50 nguyên liệu</button>
          <button onClick={() => runCommand({ kind: "alliance_leave", label: "Rời liên minh", path: "/api/commands/alliance/leave", body: {} }).catch(() => undefined)}>Rời liên minh</button>
        </div>
        {(myRole === "leader" || myRole === "officer") && <div className="governance-actions">
          <div className="governance-row">
            <input value={noticeText} onChange={event => setNoticeText(event.target.value)} placeholder="Thông báo liên minh (≤200)" maxLength={200} aria-label="Thông báo liên minh" />
            <button disabled={!noticeText.trim()} onClick={() => runCommand({ kind: "alliance_notice", label: "Đặt thông báo", path: "/api/commands/alliance/notice", body: { notice: noticeText.trim() } }).then(() => setNoticeText("")).catch(() => undefined)}>Đặt thông báo</button>
          </div>
          <div className="governance-row">
            <select value={voteCandidate} onChange={event => setVoteCandidate(event.target.value)} aria-label="Ứng viên lãnh đạo">
              <option value="">Chọn ứng viên…</option>
              {myAlliance.members.filter(m => m.playerId !== session.player.id).map(m => <option value={m.playerId} key={m.playerId}>{(snapshot.cities.find(city => city.playerId === m.playerId)?.playerName ?? m.playerId)} ({m.role})</option>)}
            </select>
            <button disabled={!voteCandidate} onClick={() => runCommand({ kind: "alliance_vote_open", label: "Mở bỏ phiếu lãnh đạo", path: "/api/commands/alliance/vote/open", body: { candidatePlayerId: voteCandidate } }).then(() => setVoteCandidate("")).catch(() => undefined)}>Mở bỏ phiếu lãnh đạo</button>
          </div>
        </div>}
        {openVote && <div className="vote-card">
          <strong>Bỏ phiếu lãnh đạo</strong>
          <span>Ứng viên: {snapshot.cities.find(city => city.playerId === openVote.candidatePlayerId)?.playerName ?? openVote.candidatePlayerId}</span>
          <span>Còn {countdown(openVote.expiresAt, now)}</span>
          <button disabled={openVote.votes.some(vote => vote.playerId === session.player.id)} onClick={() => runCommand({ kind: "alliance_vote_cast", label: "Bỏ phiếu ủng hộ", path: "/api/commands/alliance/vote/cast", body: { voteId: openVote.id, vote: true } }).catch(() => undefined)}>Đồng ý</button>
          <button disabled={openVote.votes.some(vote => vote.playerId === session.player.id)} onClick={() => runCommand({ kind: "alliance_vote_cast", label: "Bỏ phiếu phản đối", path: "/api/commands/alliance/vote/cast", body: { voteId: openVote.id, vote: false } }).catch(() => undefined)}>Phản đối</button>
        </div>}
      </div>
    )}
  </section>;
}

function EventsPanel() {
  const { state } = useGame();
  const snapshot = state.snapshot!;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return <section className="events-panel" aria-label="Sự kiện thế giới">
    <h2>Sự kiện thế giới</h2>
    {snapshot.worldEvents?.length ? snapshot.worldEvents.map(event => <div className={`event-row event-${event.eventType}`} data-testid="world-event" key={event.id}>
      <strong>{event.eventType}</strong>
      <span>Mức độ {event.severity}</span>
      <span>Còn {countdown(event.endsAt, now)}</span>
      {event.eventType === "mob_migration" && <span>{snapshot.armies.filter(army => army.sourceWorldEventId === event.id).length} bọn xâm lược</span>}
    </div>) : <p className="hint">Chưa có sự kiện đang diễn ra.</p>}
  </section>;
}

function ArchivePanel() {
  const { state, runCommand, addNotice } = useGame();
  const session = state.session!;
  const [archive, setArchive] = useState<SeasonArchive>();
  return <section className="archive-panel" aria-label="Lịch sử mùa">
    <h2>Lịch sử mùa</h2>
    <button onClick={() => api.seasonHistory(session.token).then(setArchive).catch(error => addNotice(error instanceof Error ? error.message : "Không tải được lịch sử mùa."))}>Nạp lịch sử mùa</button>
    {archive && <div className="archive-content">
      {archive.profile.badge && <p><strong>{archive.profile.badge}</strong></p>}
      <p className="hint">{archive.profile.title ?? "Chưa có danh hiệu"} · Danh tiếng {archive.profile.crossSeasonReputation}{archive.profile.crown && " · 👑"}</p>
      {archive.seasons.map((season, index) => <details key={season.seasonId} className="archive-season" data-testid="archive-season"><summary>Mùa {archive.seasons.length - index} · đóng {new Date(season.closedAt).toLocaleDateString()} · {season.rankings.length} người chơi</summary>{season.rankings.map(row => <div key={row.playerId}>#{row.rank} {row.displayName}: {row.overall}</div>)}</details>)}
    </div>}
  </section>;
}

function DiplomacyPanel() {
  const { state, runCommand } = useGame();
  const session = state.session!; const snapshot = state.snapshot!;
  const [breaking, setBreaking] = useState<Treaty | undefined>();
  const [treatyTarget, setTreatyTarget] = useState("");
  const [treatyType, setTreatyType] = useState("non_aggression");
  const frozenPlayers = new Set(snapshot.cities.filter(item => item.frozen).map(item => item.playerId));
  const otherPlayers = Object.keys(snapshot.scores).filter(id => id !== session.player.id && !frozenPlayers.has(id)).map(id => ({ id, displayName: snapshot.cities.find(c => c.playerId === id)?.playerName ?? id }));
  const myTreaties = snapshot.treaties?.filter(t => t.proposerPlayerId === session.player.id || t.targetPlayerId === session.player.id) ?? [];
  const pendingTreaties = myTreaties.filter(t => t.status === "proposed" && t.targetPlayerId === session.player.id);
  const activeTreaties = myTreaties.filter(t => t.status === "active");
  const playerName = (playerId: string) => snapshot.cities.find(c => c.playerId === playerId)?.playerName ?? playerId;
  const anchor = usePanelAnchor<HTMLElement>("diplomacy");

  return <section ref={anchor} className="diplomacy-panel" aria-label="Ngoại giao">
    <h2>Ngoại giao</h2>
    {pendingTreaties.length > 0 && <div className="treaty-pending">
      <h4>Lời đề nghị đang chờ</h4>
      {pendingTreaties.map(t => <div className="treaty-row" data-testid="treaty-proposal" key={t.id}>
        <span>{playerName(t.proposerPlayerId)} đề nghị {t.treatyType}</span>
        <button onClick={() => runCommand({ kind: "treaty_respond", label: "Chấp nhận hiệp ước", path: "/api/commands/treaty/respond", body: { treatyId: t.id, accept: true } }).catch(() => undefined)}>Chấp nhận</button>
        <button onClick={() => runCommand({ kind: "treaty_respond", label: "Từ chối hiệp ước", path: "/api/commands/treaty/respond", body: { treatyId: t.id, accept: false } }).catch(() => undefined)}>Từ chối</button>
      </div>)}
    </div>}
    {activeTreaties.length > 0 && <div className="treaty-active">
      <h4>Hiệp ước đang có hiệu lực</h4>
      {activeTreaties.map(t => {
        const partnerId = t.proposerPlayerId === session.player.id ? t.targetPlayerId : t.proposerPlayerId;
        return <div className="treaty-row" data-testid="treaty-active" key={t.id}>
          <span>{t.treatyType} với {playerName(partnerId)}</span>
          <button className="destructive" onClick={() => setBreaking(t)}>Phá hiệp ước</button>
        </div>;
      })}
    </div>}
    <h4>Đề nghị hiệp ước</h4>
    <div className="treaty-propose">
      <select value={treatyTarget} onChange={event => setTreatyTarget(event.target.value)} aria-label="Người chơi nhận đề nghị">
        <option value="">Chọn người chơi…</option>
        {otherPlayers.map(p => <option value={p.id} key={p.id}>{p.displayName}</option>)}
      </select>
      <select value={treatyType} onChange={event => setTreatyType(event.target.value)} aria-label="Loại hiệp ước">
        <option value="non_aggression">Hiệp ước không xâm lược</option>
        <option value="defensive_pact">Hiệp ước phòng thủ</option>
      </select>
      <button disabled={!treatyTarget} onClick={() => runCommand({ kind: "treaty_propose", label: "Đề nghị hiệp ước", path: "/api/commands/treaty/propose", body: { targetPlayerId: treatyTarget, treatyType } }).then(() => setTreatyTarget("")).catch(() => undefined)}>Gửi đề nghị</button>
    </div>
    {breaking && <TreatyBreakModal treaty={breaking} partnerName={playerName(breaking.proposerPlayerId === session.player.id ? breaking.targetPlayerId : breaking.proposerPlayerId)}
      onConfirm={() => { const id = breaking.id; setBreaking(undefined); runCommand({ kind: "treaty_break", label: "Phá hiệp ước", path: "/api/commands/treaty/break", body: { treatyId: id } }).catch(() => undefined); }}
      onClose={() => setBreaking(undefined)} />}
  </section>;
}

export default function AdvancedDrawer() {
  return <div className="advanced-drawer">
    <AlliancePanel />
    <EspionagePanel />
    <EventsPanel />
    <ArchivePanel />
    <DiplomacyPanel />
  </div>;
}