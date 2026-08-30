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
  socket.addEventListener("error", () => onError("KhA'ng kt n`i `c server"));
  return socket;
}

export async function startBuild(token: string, cityId: string, buildingId: "warehouse" | "road_depot" | "barracks"): Promise<void> {
  const response = await fetch(`${apiBase}/api/commands/build`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ commandId: crypto.randomUUID(), cityId, buildingId, queueType: "build" }) });
  if (!response.ok) throw new Error((await response.json()).code ?? "Build failed");
}

export async function createRoute(token: string, sourceCityId: string, destinationCityId: string): Promise<void> {
  const response = await fetch(apiBase + "/api/commands/routes", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ commandId: crypto.randomUUID(), sourceCityId, destinationCityId }) });
  if (!response.ok) throw new Error((await response.json()).code ?? "Route command failed");
}

export async function startCaravan(token: string, routeId: string, cargo: { wood: number; stone: number; iron: number }): Promise<void> {
  const response = await fetch(apiBase + "/api/commands/caravans", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ commandId: crypto.randomUUID(), routeId, cargo }) });
  if (!response.ok) throw new Error((await response.json()).code ?? "Caravan command failed");
}
export async function harvest(token: string, nodeId: string, cityId: string, amount = 50): Promise<void> {
  const response = await fetch(apiBase + "/api/commands/harvest", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ commandId: crypto.randomUUID(), nodeId, cityId, amount }) });
  if (!response.ok) throw new Error((await response.json()).code ?? "Harvest failed");
}
export async function escort(token: string, caravanId: string, armyId: string): Promise<void> {
  const response = await fetch(apiBase + "/api/commands/escort", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ commandId: crypto.randomUUID(), caravanId, armyId }) });
  if (!response.ok) throw new Error((await response.json()).code ?? "Escort failed");
}
export async function ambush(token: string, caravanId: string): Promise<void> {
  const response = await fetch(apiBase + "/api/commands/ambush", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ commandId: crypto.randomUUID(), caravanId }) });
  if (!response.ok) throw new Error((await response.json()).code ?? "Ambush failed");
}

export async function recruit(token: string, cityId: string, unitType: string, amount: number): Promise<void> {
  const response = await fetch(apiBase + "/api/commands/recruit", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ commandId: crypto.randomUUID(), cityId, unitType, amount }) });
  if (!response.ok) throw new Error((await response.json()).code ?? "Recruit failed");
}

export async function moveArmy(token: string, armyId: string, targetX: number, targetY: number): Promise<void> {
  const response = await fetch(apiBase + "/api/commands/move-army", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ commandId: crypto.randomUUID(), armyId, targetX, targetY }) });
  if (!response.ok) throw new Error((await response.json()).code ?? "Move army failed");
}

export async function attack(token: string, armyId: string, targetArmyId: string): Promise<void> {
  const response = await fetch(apiBase + "/api/commands/attack", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ commandId: crypto.randomUUID(), armyId, targetArmyId }) });
  if (!response.ok) throw new Error((await response.json()).code ?? "Attack failed");
}

export async function setFormation(token: string, armyId: string, formation: string): Promise<void> {
  const response = await fetch(apiBase + "/api/commands/formation", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ commandId: crypto.randomUUID(), armyId, formation }) });
  if (!response.ok) throw new Error((await response.json()).code ?? "Formation failed");
}

export async function mergeArmies(token: string, sourceArmyId: string, targetArmyId: string): Promise<void> {
  const response = await fetch(apiBase + "/api/commands/merge-army", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ commandId: crypto.randomUUID(), sourceArmyId, targetArmyId }) });
  if (!response.ok) throw new Error((await response.json()).code ?? "Merge army failed");
}



export async function createAlliance(token: string, name: string, tag: string): Promise<void> {
  const response = await fetch(apiBase + "/api/commands/alliance/create", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ commandId: crypto.randomUUID(), name, tag }) });
  if (!response.ok) throw new Error((await response.json()).code ?? "Create alliance failed");
}

export async function joinAlliance(token: string, allianceId: string): Promise<void> {
  const response = await fetch(apiBase + "/api/commands/alliance/join", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ commandId: crypto.randomUUID(), allianceId }) });
  if (!response.ok) throw new Error((await response.json()).code ?? "Join alliance failed");
}

export async function leaveAlliance(token: string): Promise<void> {
  const response = await fetch(apiBase + "/api/commands/alliance/leave", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ commandId: crypto.randomUUID() }) });
  if (!response.ok) throw new Error((await response.json()).code ?? "Leave alliance failed");
}

export async function contributeAlliance(token: string, cityId: string, resources: { wood: number; stone: number; iron: number }): Promise<void> {
  const response = await fetch(apiBase + "/api/commands/alliance/contribute", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ commandId: crypto.randomUUID(), cityId, resources }) });
  if (!response.ok) throw new Error((await response.json()).code ?? "Contribute alliance failed");
}

export async function proposeTreaty(token: string, targetPlayerId: string, treatyType: string): Promise<void> {
  const response = await fetch(apiBase + "/api/commands/treaty/propose", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ commandId: crypto.randomUUID(), targetPlayerId, treatyType, durationSeconds: 259200 }) });
  if (!response.ok) throw new Error((await response.json()).code ?? "Propose treaty failed");
}

export async function respondTreaty(token: string, treatyId: string, accept: boolean): Promise<void> {
  const response = await fetch(apiBase + "/api/commands/treaty/respond", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ commandId: crypto.randomUUID(), treatyId, accept }) });
  if (!response.ok) throw new Error((await response.json()).code ?? "Respond treaty failed");
}

export async function breakTreaty(token: string, treatyId: string): Promise<void> {
  const response = await fetch(apiBase + "/api/commands/treaty/break", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ commandId: crypto.randomUUID(), treatyId }) });
  if (!response.ok) throw new Error((await response.json()).code ?? "Break treaty failed");
}
