import { useEffect, useState } from "react";
import type { SeasonArchive } from "@kingdoms/shared";
import { factions } from "@kingdoms/shared";
import * as api from "../api.js";
import { useGame } from "../state.js";
import { CityPanel } from "./CityPanel.js";
import { LogisticsPanel } from "./LogisticsPanel.js";
import { ArmyPanel } from "./ArmyPanel.js";
import { OnboardingPanel } from "./OnboardingPanel.js";
import { EspionagePanel } from "./EspionagePanel.js";

export function Hud() {
  const { state, addNotice, logout } = useGame();
  const session = state.session!; const snapshot = state.snapshot!;
  const [now, setNow] = useState(Date.now()); const [archive, setArchive] = useState<SeasonArchive>();
  const [allianceName, setAllianceName] = useState("");
  const [allianceTag, setAllianceTag] = useState("");
  const [noticeText, setNoticeText] = useState("");
  const [voteCandidate, setVoteCandidate] = useState("");
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const city = snapshot.cities.find((item) => item.playerId === session.player.id) ?? snapshot.cities[0]; const score = snapshot.scores[session.player.id]; const frozenPlayers = new Set(snapshot.cities.filter(item => item.frozen).map(item => item.playerId));
  const myAlliance = snapshot.alliances?.find(a => a.members.some(m => m.playerId === session.player.id));
  const otherPlayers = Object.keys(snapshot.scores).filter(id => id !== session.player.id && !frozenPlayers.has(id)).map(id => ({ id, displayName: snapshot.cities.find(c => c.playerId === id)?.playerName ?? id }));
  const myTreaties = snapshot.treaties?.filter(t => t.proposerPlayerId === session.player.id || t.targetPlayerId === session.player.id) ?? [];
  const pendingTreaties = myTreaties.filter(t => t.status === "proposed" && t.targetPlayerId === session.player.id);
  const activeTreaties = myTreaties.filter(t => t.status === "active");
  const myRole = myAlliance?.members.find(member => member.playerId === session.player.id)?.role;
  const openVote = snapshot.allianceVotes?.find(vote => vote.allianceId === myAlliance?.id && vote.status === "open");
  const countdown = (endsAt: string) => { const seconds = Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 1000)); return `${Math.floor(seconds / 60)}m ${seconds % 60}s`; };

  return <aside className={`hud${city.frozen ? " hud-frozen" : ""}`} style={{ overflowY: "auto", maxHeight: "100vh" }}>
    <div className="brand"><strong>{session.player.displayName}</strong><span>{factions[session.player.factionId].name} <button onClick={logout}>Đăng xuất</button></span></div>
    <div className="season">Mùa đang diễn ra - còn đến {new Date(snapshot.season.endsAt).toLocaleString()}</div>

    <h2>{city.name}</h2>
    {city.frozen && <div className="frozen-banner" role="status">Tài khoản đang bị khóa — thành phố, quân đội và caravan đã đóng băng.</div>}
    <div className="resource-grid">
      {Object.entries(city.resources).map(([key, value]) => <div key={key}><span>{key}</span><strong>{value}</strong></div>)}
    </div>

    <div className="actions" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1rem" }}>
      <button disabled={city.frozen || city.queues.filter((q) => q.type === "build").length >= 2} onClick={() => api.startBuild(session.token, city.id, "warehouse").catch((e) => addNotice(e.message))}>Xây kho</button>
      <button disabled={city.frozen || city.queues.filter((q) => q.type === "build").length >= 2} onClick={() => api.startBuild(session.token, city.id, "road_depot").catch((e) => addNotice(e.message))}>Xây trạm trung chuyển</button>
      <button disabled={city.frozen || city.queues.filter((q) => q.type === "build").length >= 2} onClick={() => api.startBuild(session.token, city.id, "barracks").catch((e) => addNotice(e.message))}>Xây trại lính</button>
    </div>
    <p>Build queues: {city.queues.filter((queue) => queue.type === "build").length}/2</p>

    <OnboardingPanel />
    <CityPanel />
    <LogisticsPanel />
    <ArmyPanel />

    <h2>Điểm mùa</h2>
    <div className="scores" style={{ display: "flex", gap: "1rem" }}>
      <span>⚔ {score?.military ?? 0}</span>
      <span>◈ {score?.economy ?? 0}</span>
      <span>✦ {score?.diplomacy ?? 0}</span>
    </div>

    <details className="drawer" open>
      <summary>Nâng cao (liên minh · tình báo · sự kiện · ngoại giao)</summary>
      <section className="alliance-panel" style={{ marginTop: "1rem", padding: "1rem", background: "rgba(0,0,0,0.2)" }}>
      <h2>Alliance</h2>
      {!myAlliance ? (
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.5rem" }}>
            <input value={allianceName} onChange={event => setAllianceName(event.target.value)} placeholder="Tên liên minh (2-30)" maxLength={30} aria-label="Tên liên minh" />
            <input value={allianceTag} onChange={event => setAllianceTag(event.target.value)} placeholder="Ký hiệu (2-5 ký tự)" maxLength={5} aria-label="Ký hiệu liên minh" />
            <button disabled={allianceName.trim().length < 2 || allianceTag.trim().length < 2} onClick={() => api.createAlliance(session.token, allianceName.trim(), allianceTag.trim()).then(() => { setAllianceName(""); setAllianceTag(""); }).catch(e => addNotice(e.message))}>Tạo liên minh</button>
          </div>

          <div style={{ marginTop: "0.5rem" }}>
            {snapshot.alliances?.map(a => (
              <div key={a.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span>[{a.tag}] {a.name} ({a.members.length}/10)</span>
                <button onClick={() => api.joinAlliance(session.token, a.id).catch(e => addNotice(e.message))}>Join</button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <h3>[{myAlliance.tag}] {myAlliance.name}</h3>
          {myAlliance.notice && <p className="alliance-notice">{myAlliance.notice}</p>}
          <p>Members: {myAlliance.members.length}/10</p>
          <ul>
            {myAlliance.members.map(m => (
              <li key={m.playerId}>
                {(snapshot.cities.find(c => c.playerId === m.playerId)?.playerName ?? m.playerId)} ({m.role}) - Contrib: {m.contribution}
                {myRole === "leader" && m.role !== "leader" && <span> <button disabled={frozenPlayers.has(m.playerId)} onClick={() => api.manageAllianceMember(session.token, m.playerId, m.role === "officer" ? "demote" : "promote").catch(e => addNotice(e.message))}>{m.role === "officer" ? "Demote" : "Promote"}</button> <button onClick={() => api.manageAllianceMember(session.token, m.playerId, "kick").catch(e => addNotice(e.message))}>Kick</button></span>}
              </li>
            ))}
          </ul>
          <button onClick={() => api.contributeAlliance(session.token, city.id, { wood: 50, stone: 50, iron: 50 }).catch(e => addNotice(e.message))}>Contribute 50 resources</button>
          <button style={{ marginLeft: "0.5rem" }} onClick={() => api.leaveAlliance(session.token).catch(e => addNotice(e.message))}>Leave Alliance</button>
          {(myRole === "leader" || myRole === "officer") && <div className="governance-actions" style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.5rem" }}>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <input value={noticeText} onChange={event => setNoticeText(event.target.value)} placeholder="Thông báo liên minh (≤200)" maxLength={200} aria-label="Thông báo liên minh" />
            <button disabled={!noticeText.trim()} onClick={() => api.setAllianceNotice(session.token, noticeText.trim()).then(() => setNoticeText("")).catch(e => addNotice(e.message))}>Đặt thông báo</button>
          </div>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <select value={voteCandidate} onChange={event => setVoteCandidate(event.target.value)} aria-label="Ứng viên lãnh đạo">
              <option value="">Chọn ứng viên…</option>
              {myAlliance.members.filter(m => m.playerId !== session.player.id).map(m => <option value={m.playerId} key={m.playerId}>{(snapshot.cities.find(city => city.playerId === m.playerId)?.playerName ?? m.playerId)} ({m.role})</option>)}
            </select>
            <button disabled={!voteCandidate} onClick={() => api.openAllianceVote(session.token, voteCandidate).then(() => setVoteCandidate("")).catch(e => addNotice(e.message))}>Mở bỏ phiếu lãnh đạo</button>
          </div>
        </div>}
          {openVote && <div className="vote-card"><strong>Leader vote</strong><span>Candidate: {snapshot.cities.find(city => city.playerId === openVote.candidatePlayerId)?.playerName ?? openVote.candidatePlayerId}</span><span>Ends in {countdown(openVote.expiresAt)}</span><button disabled={openVote.votes.some(vote => vote.playerId === session.player.id)} onClick={() => api.castAllianceVote(session.token, openVote.id, true).catch(e => addNotice(e.message))}>Yes</button><button disabled={openVote.votes.some(vote => vote.playerId === session.player.id)} onClick={() => api.castAllianceVote(session.token, openVote.id, false).catch(e => addNotice(e.message))}>No</button></div>}
        </div>
      )}
    </section>

    <EspionagePanel />

    <section className="events-panel" style={{ marginTop: "1rem", padding: "1rem", background: "rgba(0,0,0,0.2)" }}>
      <h2>Sự kiện thế giới</h2>
      {snapshot.worldEvents?.length ? snapshot.worldEvents.map(event => <div className={`event-row event-${event.eventType}`} key={event.id}><strong>{event.eventType}</strong><span>Severity {event.severity}</span><span>{countdown(event.endsAt)}</span>{event.eventType === "mob_migration" && <span>{snapshot.armies.filter(army => army.sourceWorldEventId === event.id).length} mobs</span>}</div>) : <p>Chưa có sự kiện đang diễn ra.</p>}
    </section>
    <section className="archive-panel" style={{ marginTop: "1rem", padding: "1rem", background: "rgba(0,0,0,0.2)" }}><h2>Season History</h2><button onClick={() => api.seasonHistory(session.token).then(setArchive).catch(error => addNotice(error.message))}>Load archive</button>{archive && <div><p>{archive.profile.badge && `${archive.profile.badge} · `}{archive.profile.title ?? "No title"} · Rep {archive.profile.crossSeasonReputation}{archive.profile.crown && " · 👑"}</p>{archive.seasons.map(season => <details key={season.seasonId}><summary>{season.seasonId} · {new Date(season.closedAt).toLocaleDateString()}</summary>{season.rankings.map(row => <div key={row.playerId}>#{row.rank} {row.displayName}: {row.overall}</div>)}</details>)}</div>}</section>
    <section className="diplomacy-panel" style={{ marginTop: "1rem", padding: "1rem", background: "rgba(0,0,0,0.2)" }}>
      <h2>Diplomacy</h2>

      {pendingTreaties.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <h4>Pending Requests</h4>
          {pendingTreaties.map(t => (
            <div key={t.id}>
              {(snapshot.cities.find(c => c.playerId === t.proposerPlayerId)?.playerName ?? t.proposerPlayerId)} proposed {t.treatyType}
              <button onClick={() => api.respondTreaty(session.token, t.id, true).catch(e => addNotice(e.message))}>Accept</button>
              <button onClick={() => api.respondTreaty(session.token, t.id, false).catch(e => addNotice(e.message))}>Reject</button>
            </div>
          ))}
        </div>
      )}

      {activeTreaties.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <h4>Active Treaties</h4>
          {activeTreaties.map(t => {
            const partnerId = t.proposerPlayerId === session.player.id ? t.targetPlayerId : t.proposerPlayerId;
            return <div key={t.id}>
              {t.treatyType} with {(snapshot.cities.find(c => c.playerId === partnerId)?.playerName ?? partnerId)}
              <button onClick={() => { if(confirm("Break treaty? You will lose 150 reputation!")) api.breakTreaty(session.token, t.id).catch(e => addNotice(e.message))}}>Break</button>
            </div>
          })}
        </div>
      )}

      <h4>Propose Treaty</h4>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <select id="treaty-target">
          {otherPlayers.map(p => <option value={p.id} key={p.id}>{p.displayName}</option>)}
        </select>
        <select id="treaty-type">
          <option value="non_aggression">Non-Aggression Pact</option>
          <option value="defensive_pact">Defensive Pact</option>
        </select>
        <button onClick={() => {
          const target = (document.getElementById("treaty-target") as HTMLSelectElement).value;
          const type = (document.getElementById("treaty-type") as HTMLSelectElement).value;
          if (target && type) api.proposeTreaty(session.token, target, type as any).catch(e => addNotice(e.message));
        }}>Propose</button>
      </div>
    </section>
    </details>
  </aside>;
}