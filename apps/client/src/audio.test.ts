import assert from "node:assert/strict";
import test from "node:test";
import { normaliseAudioSettings, playUiClickFromUserGesture, readAudioSettings } from "./audio.js";

test("audio settings have safe defaults and clamp persisted volume", () => {
  assert.deepEqual(normaliseAudioSettings(undefined), { muted: false, volume: 0.5 });
  assert.deepEqual(normaliseAudioSettings({ muted: true, volume: 4 }), { muted: true, volume: 1 });
  assert.deepEqual(normaliseAudioSettings({ muted: false, volume: -2 }), { muted: false, volume: 0 });
  assert.deepEqual(normaliseAudioSettings({ muted: "no", volume: Number.NaN }), { muted: false, volume: 0.5 });
});

test("audio service is inert without a browser or user gesture", () => {
  assert.deepEqual(readAudioSettings(), { muted: false, volume: 0.5 });
  assert.doesNotThrow(() => playUiClickFromUserGesture());
});
