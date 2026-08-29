import { useEffect, useMemo, useRef, useState } from "react";
import type { FactionId, WorldSnapshot } from "@kingdoms/shared";
import { factions } from "@kingdoms/shared";
import { login, openSocket, restoreSession, startBuild, type Session } from "./api.js";
import { createWorldMap } from "./map.js";

function Login({ onSession }: { onSession: (session: Session) => void }) {
  const [name, setName] = useState("Lan"); const [faction, setFaction] = useState<FactionId>("meridian"); const [error, setError] = useState("");
  return <form className="login-card" onSubmit={async (event) => { event.preventDefault(); try { onSession(await login(name, faction)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Login failed"); } }}><h1>Kingdoms of Meridian</h1><p>Chiến thắng bằng chiến lược, kinh tế và ngoại giao.</p><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Tên người chơi" /><select value={faction} onChange={(event) => setFaction(event.target.value as FactionId)}>{Object.entries(factions).map(([id, item]) => <option value={id} key={id}>{item.name}</option>)}</select><button type="submit">Vào kingdom</button>{error && <small>{error}</small>}</form>;
}

function Hud({ session, snapshot, onError }: { session: Session; snapshot: WorldSnapshot; onError: (error: string) => void }) {
  const city = snapshot.cities.find((item) => item.playerId === session.player.id) ?? snapshot.cities[0]; const score = snapshot.scores[session.player.id];
  return <aside className="hud"><div className="brand"><strong>{session.player.displayName}</strong><span>{factions[session.player.factionId].name}</span></div><div className="season">Mùa đang diễn ra · còn đến {new Date(snapshot.season.endsAt).toLocaleString()}</div><div className="resource-grid">{Object.entries(city.resources).map(([key, value]) => <div key={key}><span>{key}</span><strong>{value}</strong></div>)}</div><h2>{city.name}</h2><p>Build queues: {city.queues.filter((queue) => queue.type === "build").length}/2 · Research: {city.queues.filter((queue) => queue.type === "research").length}/1</p><div className="actions"><button disabled={city.queues.filter((queue) => queue.type === "build").length >= 2} onClick={() => startBuild(session.token, city.id, "warehouse").catch((error) => onError(error.message))}>Xây kho</button><button disabled={city.queues.filter((queue) => queue.type === "build").length >= 2} onClick={() => startBuild(session.token, city.id, "road_depot").catch((error) => onError(error.message))}>Xây kho trung chuyển</button></div><h2>Điểm mùa</h2><div className="scores"><span>⚔ {score?.military ?? 0}</span><span>◈ {score?.economy ?? 0}</span><span>✦ {score?.diplomacy ?? 0}</span></div><p className="hint">Vàng trên bản đồ là caravan tiếp tế. Hãy bảo vệ chuỗi cung ứng.</p></aside>;
}

export default function App() {
  const [session, setSession] = useState<Session>(); const [snapshot, setSnapshot] = useState<WorldSnapshot>(); const [error, setError] = useState(""); const mapContainer = useRef<HTMLDivElement>(null); const map = useRef<ReturnType<typeof createWorldMap>>();
  useEffect(() => { const saved = sessionStorage.getItem("kingdoms-session"); if (!saved) return; try { const parsed = JSON.parse(saved) as Pick<Session, "token" | "player">; void restoreSession(parsed.token, parsed.player).then((next) => { setSession(next); setSnapshot(next.snapshot); }).catch(() => sessionStorage.removeItem("kingdoms-session")); } catch { sessionStorage.removeItem("kingdoms-session"); } }, []);
  useEffect(() => { if (!session || !snapshot || !mapContainer.current) return; map.current?.destroy(); map.current = createWorldMap(mapContainer.current, snapshot, session.player.id); const socket = openSocket(session.token, setSnapshot, setError); return () => { socket.close(); map.current?.destroy(); }; }, [session]);
  useEffect(() => { if (snapshot) map.current?.update(snapshot); }, [snapshot]);
  const content = useMemo(() => session && snapshot ? <><div ref={mapContainer} className="map" /><Hud session={session} snapshot={snapshot} onError={setError} /></> : <Login onSession={(next) => { sessionStorage.setItem("kingdoms-session", JSON.stringify({ token: next.token, player: next.player })); setSession(next); setSnapshot(next.snapshot); }} />, [session, snapshot]);
  return <main>{content}{error && <div className="toast" onClick={() => setError("")}>{error}</div>}</main>;
}
