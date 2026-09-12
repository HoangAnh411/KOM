export const DIAGNOSTIC_MAX_CAPACITY = 200;
export const DIAGNOSTIC_DEFAULT_CAPACITY = 100;
export const REDACTED = "[REDACTED]";

export type RedactedValue = null | boolean | number | string | RedactedValue[] | { [key: string]: RedactedValue };

export interface NormalizedError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

export interface DiagnosticEntry {
  readonly sequence: number;
  readonly timestamp: string;
  readonly kind: string;
  readonly message: string;
  readonly error?: NormalizedError;
  readonly details?: RedactedValue;
}

export interface DiagnosticInput {
  readonly kind: string;
  readonly message: string;
  readonly error?: unknown;
  readonly details?: unknown;
}

const SENSITIVE_KEY = /(?:password|passwd|pwd|passphrase|passcode|pin|token|secret|credential|cookie)|^(?:authorization|proxyauthorization|apikey|privatekey|session|username|displayname|email|phone|address|playerid|userid|accountid|name)$/i;
const INLINE_SECRET = /\b(authorization|proxy-authorization|password|passwd|pwd|passphrase|passcode|pin|access[_-]?token|refresh[_-]?token|token|secret|api[_-]?key|cookie|username|display[_-]?name|email|phone|address|player[_-]?id|user[_-]?id|account[_-]?id)(["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key.replace(/[^a-z0-9]/gi, ""));
}

function boundedText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…[TRUNCATED]`;
}

export function redactText(value: string, limit = 500): string {
  const redacted = value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(/\bBasic\s+[A-Za-z0-9+/=]+/gi, `Basic ${REDACTED}`)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED)
    .replace(INLINE_SECRET, (_match, key: string, separator: string) => `${key}${separator}${REDACTED}`)
    .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, `$1${REDACTED}@`)
    .replace(/(https?:\/\/[^\s?#)]+)(?:\?[^\s#)]*)?(?:#[^\s)]*)?/gi, (_match, base: string) => base)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[REDACTED_ID]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[REDACTED_IP]")
    .replace(/\b(?:\+?\d[\s().-]*){9,}\b/g, "[REDACTED_PHONE]")
    .replace(/([A-Z]:\\Users\\)[^\\\s]+/gi, "$1[REDACTED]")
    .replace(/(\/(?:home|Users)\/)[^/\s]+/g, "$1[REDACTED]")
    .replace(/\b[A-F0-9]{32,}\b/gi, "[REDACTED_OPAQUE]")
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, "[REDACTED_OPAQUE]");
  return boundedText(redacted, limit);
}

function redactUnknown(value: unknown, depth: number, seen: WeakSet<object>): RedactedValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string") return redactText(value);
  if (typeof value === "bigint" || typeof value === "symbol" || typeof value === "function" || typeof value === "undefined") return redactText(String(value));
  if (depth >= 5) return "[TRUNCATED]";
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 30).map(item => redactUnknown(item, depth + 1, seen));
  const result: Record<string, RedactedValue> = Object.create(null) as Record<string, RedactedValue>;
  let count = 0;
  for (const key of Object.keys(value as object).sort()) {
    if (count++ >= 30) { result["[TRUNCATED]"] = "[TRUNCATED]"; break; }
    let member: unknown;
    try { member = (value as Record<string, unknown>)[key]; } catch { member = "[UNREADABLE]"; }
    result[redactText(key, 80)] = isSensitiveKey(key) ? REDACTED : redactUnknown(member, depth + 1, seen);
  }
  return result;
}

export function redactValue(value: unknown): RedactedValue {
  return redactUnknown(value, 0, new WeakSet());
}

export function normalizeError(value: unknown): NormalizedError {
  if (value instanceof Error) {
    let stack: string | undefined;
    try { stack = value.stack; } catch { stack = undefined; }
    let name = "Error";
    let message = "No error message";
    try { name = value.name || name; } catch { /* hostile Error subclass */ }
    try { message = value.message || message; } catch { /* hostile Error subclass */ }
    const normalized: NormalizedError = {
      name: redactText(name, 100),
      message: redactText(message),
      ...(stack ? { stack: redactText(stack, 4_000) } : {}),
    };
    return normalized;
  }
  if (typeof value === "string") return { name: "Error", message: redactText(value) };
  try {
    return { name: "NonError", message: boundedText(JSON.stringify(redactValue(value)) ?? String(value), 1_000) };
  } catch {
    return { name: "NonError", message: "[UNREADABLE]" };
  }
}

function safeKind(value: string): string {
  const normalized = value.replace(/[^a-z0-9_.-]/gi, "_").slice(0, 64);
  return normalized || "diagnostic";
}

function cloneRedacted(value: RedactedValue): RedactedValue {
  if (Array.isArray(value)) return value.map(cloneRedacted);
  if (value !== null && typeof value === "object") {
    const result: Record<string, RedactedValue> = Object.create(null) as Record<string, RedactedValue>;
    for (const [key, member] of Object.entries(value)) result[key] = cloneRedacted(member);
    return result;
  }
  return value;
}

function cloneEntry(entry: DiagnosticEntry): DiagnosticEntry {
  return {
    ...entry,
    ...(entry.error ? { error: { ...entry.error } } : {}),
    ...(entry.details === undefined ? {} : { details: cloneRedacted(entry.details) }),
  };
}

export class DiagnosticBuffer {
  readonly capacity: number;
  private entries: DiagnosticEntry[] = [];
  private nextSequence = 1;
  private readonly now: () => Date;

  constructor(capacity = DIAGNOSTIC_DEFAULT_CAPACITY, now: () => Date = () => new Date()) {
    this.capacity = Math.max(1, Math.min(DIAGNOSTIC_MAX_CAPACITY, Math.floor(capacity) || DIAGNOSTIC_DEFAULT_CAPACITY));
    this.now = now;
  }

  add(input: DiagnosticInput): DiagnosticEntry {
    const entry: DiagnosticEntry = Object.freeze({
      sequence: this.nextSequence++,
      timestamp: this.now().toISOString(),
      kind: safeKind(input.kind),
      message: redactText(input.message),
      ...(input.error === undefined ? {} : { error: Object.freeze(normalizeError(input.error)) }),
      ...(input.details === undefined ? {} : { details: redactValue(input.details) }),
    });
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.splice(0, this.entries.length - this.capacity);
    return entry;
  }

  snapshot(): readonly DiagnosticEntry[] {
    return this.entries.map(entry => cloneEntry(entry));
  }

  clear(): void { this.entries = []; }

  export(): string {
    return JSON.stringify({ format: "kingdoms-client-diagnostics", version: 1, entries: this.snapshot() }, null, 2);
  }
}

export const diagnostics = new DiagnosticBuffer();

export interface ErrorEventLike {
  readonly message?: string;
  readonly error?: unknown;
  readonly filename?: string;
  readonly lineno?: number;
  readonly colno?: number;
}

export interface RejectionEventLike { readonly reason?: unknown; }

interface GlobalErrorTarget {
  addEventListener(type: "error", listener: (event: ErrorEventLike) => void): void;
  addEventListener(type: "unhandledrejection", listener: (event: RejectionEventLike) => void): void;
  removeEventListener(type: "error", listener: (event: ErrorEventLike) => void): void;
  removeEventListener(type: "unhandledrejection", listener: (event: RejectionEventLike) => void): void;
}

export function installGlobalDiagnosticCapture(target: GlobalErrorTarget, buffer: DiagnosticBuffer = diagnostics): () => void {
  const onError = (event: ErrorEventLike) => {
    buffer.add({
      kind: "global.error",
      message: event.message || "Uncaught client error",
      error: event.error,
      details: event.filename ? { source: event.filename, line: event.lineno, column: event.colno } : undefined,
    });
  };
  const onUnhandledRejection = (event: RejectionEventLike) => {
    buffer.add({
      kind: "global.unhandled_rejection",
      message: "Unhandled promise rejection",
      error: event.reason,
    });
  };
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onUnhandledRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}

export function exportDiagnostics(buffer: DiagnosticBuffer = diagnostics): string {
  return buffer.export();
}

export function downloadDiagnostics(buffer: DiagnosticBuffer = diagnostics): void {
  const blob = new Blob([buffer.export()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `kingdoms-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
