import type { FactionId, WorldSnapshot } from "@kingdoms/shared";

export const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
export type Session = { token: string; player: { id: string; displayName: string; factionId: FactionId }; snapshot: WorldSnapshot };

export async function login(displayName: string, factionId: FactionId): Promise<Session> {
  const response = await fetch(`${apiBase}/api/auth/dev`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName, factionId }) });
  if (!response.ok) throw new Error((await response.json()).code ?? "Login failed");
  return response.json() as Promise<Session>;
}

export async function restoreSession(token: string, player: Session["player"]): Promise<Session> {
  const response = await fetch(`${apiBase}/api/bootstrap`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("SESSION_EXPIRED");
  const result = await response.json() as { snapshot: WorldSnapshot };
  return { token, player, snapshot: result.snapshot };
}

export function openSocket(token: string, onSnapshot: (snapshot: WorldSnapshot) => void, onError: (message: string) => void): WebSocket {
  const socket = new WebSocket(`${apiBase.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`);
  socket.addEventListener("message", (event) => { const message = JSON.parse(event.data) as { type: string; payload?: WorldSnapshot; message?: string }; if (message.type === "SNAPSHOT" && message.payload) onSnapshot(message.payload); if (message.type === "ERROR") onError(message.message ?? "Server rejected command"); });
  socket.addEventListener("error", () => onError("Không kết nối được server"));
  return socket;
}

export async function startBuild(token: string, cityId: string, buildingId: "warehouse" | "road_depot"): Promise<void> {
  const response = await fetch(`${apiBase}/api/commands/build`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ commandId: crypto.randomUUID(), cityId, buildingId, queueType: "build" }) });
  if (!response.ok) throw new Error((await response.json()).code ?? "Build failed");
}
