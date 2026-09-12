export interface AudioSettings {
  muted: boolean;
  volume: number;
}

const STORAGE_KEY = "meridian-audio-settings";
const DEFAULT_AUDIO_SETTINGS: AudioSettings = { muted: false, volume: 0.5 };
let audioContext: AudioContext | null = null;

export function normaliseAudioSettings(value: unknown): AudioSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_AUDIO_SETTINGS };
  const candidate = value as Partial<AudioSettings>;
  const volume = typeof candidate.volume === "number" && Number.isFinite(candidate.volume)
    ? Math.min(1, Math.max(0, candidate.volume))
    : DEFAULT_AUDIO_SETTINGS.volume;
  return {
    muted: typeof candidate.muted === "boolean" ? candidate.muted : DEFAULT_AUDIO_SETTINGS.muted,
    volume,
  };
}

export function readAudioSettings(): AudioSettings {
  if (typeof window === "undefined") return { ...DEFAULT_AUDIO_SETTINGS };
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? normaliseAudioSettings(JSON.parse(saved)) : { ...DEFAULT_AUDIO_SETTINGS };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function setAudioSettings(value: AudioSettings): AudioSettings {
  const settings = normaliseAudioSettings(value);
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* Storage can be disabled. */ }
  }
  return settings;
}

/** Call only from a click/keyboard activation handler. The AudioContext is
 * created and resumed synchronously in that user gesture, never on page load. */
export function playUiClickFromUserGesture(): void {
  if (typeof window === "undefined") return;
  const settings = readAudioSettings();
  if (settings.muted || settings.volume <= 0 || typeof window.AudioContext === "undefined") return;
  try {
    audioContext ??= new window.AudioContext();
    if (audioContext.state === "suspended") void audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(520, now);
    oscillator.frequency.exponentialRampToValueAtTime(390, now + 0.035);
    gain.gain.setValueAtTime(Math.max(0.0001, settings.volume * 0.055), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.045);
  } catch {
    // Audio is enhancement-only and must never interfere with the command click.
  }
}
