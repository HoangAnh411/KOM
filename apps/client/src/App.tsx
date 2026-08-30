import { useEffect, useMemo, useRef, useState } from "react";
import type { FactionId, WorldSnapshot } from "@kingdoms/shared";
import { factions } from "@kingdoms/shared";
import * as api from "./api.js";
import { createWorldMap } from "./map.js";

type Session = api.Session;

function Login({ onSession }: { onSession: (session: Session) => void }) {
  const [name, setName] = useState("Lan"); const [faction, setFaction] = useState<FactionId>("meridian"); const [error, setError] = useState("");
  return <form className="login-card" onSubmit={async (event) => { event.preventDefault(); try { onSession(await api.login(name, faction)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Login failed"); } }}><h1>Kingdoms of Meridian</h1><p>Chi?n th?ng b?ng chi?n lu?c, kinh t? và ngo?i giao.</p><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Tên ngu?i choi" /><select value={faction} onChange={(event) => setFaction(event.target.value as FactionId)}>{Object.entries(factions).map(([id, item]) => <option value={id} key={id}>{item.name}</option>)}</select><button type="submit">Vào kingdom</button>{error && <small>{error}</small>}</form>;
}

function Hud({ session, snapshot, onError }: { session: Session; snapshot: WorldSnapshot; onError: (error: string) => void }) {
  const city = snapshot.cities.find((item) => item.playerId === session.player.id) ?? snapshot.cities[0]; const score = snapshot.scores[session.player.id];
  const myAlliance = snapshot.alliances?.find(a => a.members.some(m => m.playerId === session.player.id));
  const otherPlayers = Object.keys(snapshot.scores).filter(id => id !== session.player.id).map(id => ({ id, displayName: snapshot.cities.find(c => c.playerId === id)?.playerName ?? id }));
  const myTreaties = snapshot.treaties?.filter(t => t.proposerPlayerId === session.player.id || t.targetPlayerId === session.player.id) ?? [];
  const pendingTreaties = myTreaties.filter(t => t.status === "proposed" && t.targetPlayerId === session.player.id);
  const activeTreaties = myTreaties.filter(t => t.status === "active");

  return <aside className="hud" style={{ overflowY: "auto", maxHeight: "100vh" }}>
    <div className="brand"><strong>{session.player.displayName}</strong><span>{factions[session.player.factionId].name}</span></div>
    <div className="season">Mùa dang di?n ra - còn d?n {new Date(snapshot.season.endsAt).toLocaleString()}</div>
    
    <h2>{city.name}</h2>
    <div className="resource-grid">
      {Object.entries(city.resources).map(([key, value]) => <div key={key}><span>{key}</span><strong>{value}</strong></div>)}
    </div>
    
    <div className="actions" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1rem" }}>
      <button disabled={city.queues.filter((q) => q.type === "build").length >= 2} onClick={() => api.startBuild(session.token, city.id, "warehouse").catch((e) => onError(e.message))}>Xây kho</button>
      <button disabled={city.queues.filter((q) => q.type === "build").length >= 2} onClick={() => api.startBuild(session.token, city.id, "road_depot").catch((e) => onError(e.message))}>Xây tr?m trung chuy?n</button>
      <button disabled={city.queues.filter((q) => q.type === "build").length >= 2} onClick={() => api.startBuild(session.token, city.id, "barracks").catch((e) => onError(e.message))}>Xây tr?i lính</button>
    </div>

    <h2>Ði?m mùa</h2>
    <div className="scores" style={{ display: "flex", gap: "1rem" }}>
      <span>?? {score?.military ?? 0}</span>
      <span>?? {score?.economy ?? 0}</span>
      <span>?? {score?.diplomacy ?? 0}</span>
    </div>

    <section className="alliance-panel" style={{ marginTop: "1rem", padding: "1rem", background: "rgba(0,0,0,0.2)" }}>
      <h2>Alliance</h2>
      {!myAlliance ? (
        <div>
          <button onClick={() => {
            const name = prompt("Alliance Name:");
            const tag = prompt("Alliance Tag (2-5 chars):");
            if (name && tag) api.createAlliance(session.token, name, tag).catch(e => onError(e.message));
          }}>Create Alliance</button>
          
          <div style={{ marginTop: "0.5rem" }}>
            {snapshot.alliances?.map(a => (
              <div key={a.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span>[{a.tag}] {a.name} ({a.members.length}/10)</span>
                <button onClick={() => api.joinAlliance(session.token, a.id).catch(e => onError(e.message))}>Join</button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <h3>[{myAlliance.tag}] {myAlliance.name}</h3>
          <p>Members: {myAlliance.members.length}/10</p>
          <ul>
            {myAlliance.members.map(m => (
              <li key={m.playerId}>
                {(snapshot.cities.find(c => c.playerId === m.playerId)?.playerName ?? m.playerId)} ({m.role}) - Contrib: {m.contribution}
              </li>
            ))}
          </ul>
          <button onClick={() => api.contributeAlliance(session.token, city.id, { wood: 50, stone: 50, iron: 50 }).catch(e => onError(e.message))}>Contribute 50 resources</button>
          <button style={{ marginLeft: "0.5rem" }} onClick={() => api.leaveAlliance(session.token).catch(e => onError(e.message))}>Leave Alliance</button>
        </div>
      )}
    </section>

    <section className="diplomacy-panel" style={{ marginTop: "1rem", padding: "1rem", background: "rgba(0,0,0,0.2)" }}>
      <h2>Diplomacy</h2>
      
      {pendingTreaties.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <h4>Pending Requests</h4>
          {pendingTreaties.map(t => (
            <div key={t.id}>
              {(snapshot.cities.find(c => c.playerId === t.proposerPlayerId)?.playerName ?? t.proposerPlayerId)} proposed {t.treatyType}
              <button onClick={() => api.respondTreaty(session.token, t.id, true).catch(e => onError(e.message))}>Accept</button>
              <button onClick={() => api.respondTreaty(session.token, t.id, false).catch(e => onError(e.message))}>Reject</button>
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
              <button onClick={() => { if(confirm("Break treaty? You will lose 150 reputation!")) api.breakTreaty(session.token, t.id).catch(e => onError(e.message))}}>Break</button>
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
          if (target && type) api.proposeTreaty(session.token, target, type as any).catch(e => onError(e.message));
        }}>Propose</button>
      </div>
    </section>
  </aside>;
}

export default function App() {
  const [session, setSession] = useState<Session>(); const [snapshot, setSnapshot] = useState<WorldSnapshot>(); const [error, setError] = useState(""); const mapContainer = useRef<HTMLDivElement>(null); const map = useRef<ReturnType<typeof createWorldMap>>();
  useEffect(() => { const saved = sessionStorage.getItem("kingdoms-session"); if (!saved) return; try { const parsed = JSON.parse(saved) as Pick<Session, "token" | "player">; void api.restoreSession(parsed.token, parsed.player).then((next) => { setSession(next); setSnapshot(next.snapshot); }).catch(() => sessionStorage.removeItem("kingdoms-session")); } catch { sessionStorage.removeItem("kingdoms-session"); } }, []);
  useEffect(() => { if (!session || !snapshot || !mapContainer.current) return; map.current?.destroy(); map.current = createWorldMap(mapContainer.current, snapshot, session.player.id); const socket = api.openSocket(session.token, setSnapshot, setError); return () => { socket.close(); map.current?.destroy(); }; }, [session]);
  useEffect(() => { if (snapshot) map.current?.update(snapshot); }, [snapshot]);
  const content = useMemo(() => session && snapshot ? <><div ref={mapContainer} className="map" /><Hud session={session} snapshot={snapshot} onError={setError} /></> : <Login onSession={(next) => { sessionStorage.setItem("kingdoms-session", JSON.stringify({ token: next.token, player: next.player })); setSession(next); setSnapshot(next.snapshot); }} />, [session, snapshot]);
  return <main>{content}{error && <div className="toast" onClick={() => setError("")}>{error}</div>}</main>;
}

