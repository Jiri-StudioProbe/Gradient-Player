import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultSettings,
  applyPreset,
  styleOf,
  sanitize,
  loadSettings,
  saveSettings,
  STORAGE_KEY,
} from "../js/settings.js";

test("defaults match the Guided preset", () => {
  assert.equal(styleOf(defaultSettings()), "guided");
});

test("Guided and Free differ only in snapping; neither enables bend", () => {
  const s = defaultSettings();
  applyPreset(s, "free");
  assert.equal(styleOf(s), "free");
  assert.equal(s.snap, false);
  assert.equal(s.bendRange, 0);
  applyPreset(s, "guided");
  assert.equal(styleOf(s), "guided");
  assert.equal(s.snap, true);
  assert.equal(s.scale, "majPent");
});

test("tweaking a single setting makes the style 'custom'", () => {
  const s = defaultSettings();
  s.bendRange = 5;
  assert.equal(styleOf(s), "custom");
});

test("sanitize drops unknown / mistyped values and clamps ranges", () => {
  const s = sanitize({ scale: "nope", octaves: 99, volume: -3, bendRange: "x", snap: "yes", surface: "piano", effects: { reverb: true, bogus: true } });
  assert.equal(s.scale, "majPent");
  assert.equal(s.octaves, 4);
  assert.equal(s.volume, 0);
  assert.equal(s.bendRange, 0);
  assert.equal(s.snap, true);
  assert.equal(s.surface, "piano");
  assert.equal(s.effects.reverb, true);
  assert.equal("bogus" in s.effects, false);
});

test("storage that throws never breaks the app", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(loadSettings(broken), defaultSettings());
  assert.doesNotThrow(() => saveSettings(defaultSettings(), broken));
});

test("settings round-trip through storage", () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const s = defaultSettings();
  applyPreset(s, "free");
  s.effects.delay = true;
  saveSettings(s, storage);
  assert.ok(mem.has(STORAGE_KEY));
  assert.deepEqual(loadSettings(storage), s);
});
