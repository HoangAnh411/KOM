// WebSocket connection state machine (from the socket's raw lifecycle events).
// Open alone is NOT online: online requires the AUTH handshake to complete
// with the first snapshot.

export type ConnectionState = "connecting" | "online" | "reconnecting" | "offline";
export type ConnectionEvent = { type: "open" } | { type: "authed" } | { type: "lost" } | { type: "offline" } | { type: "online" };

export function reduceConnection(state: ConnectionState, event: ConnectionEvent): ConnectionState {
  switch (event.type) {
    // A socket opening after a loss keeps the "reconnecting" label until the
    // AUTH handshake delivers the first snapshot.
    case "open": return state === "reconnecting" ? "reconnecting" : "connecting";
    case "authed": return "online";
    case "lost": return "reconnecting";
    case "offline": return "offline";
    case "online": return "connecting";
  }
}

/** A restore notice fires on any re-establishment; the caller additionally
 * guards with an ever-online flag, so the first-ever connect stays silent. */
export function shouldNotifyRestore(previous: ConnectionState, next: ConnectionState): boolean {
  return next === "online" && (previous === "reconnecting" || previous === "connecting");
}