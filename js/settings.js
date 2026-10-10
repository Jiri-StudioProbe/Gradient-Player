// Settings state, the Guided/Free "play style" presets, and persistence.
//
// EVALUATION SWITCH: "Guided" and "Free glide" differ only in whether pitch snaps to a scale.
// Once one is chosen, delete the other preset, the style pill/segmented control (see main.js,
// index.html) and `styleOf`.

export const STORAGE_KEY = "gradient-player:v1";

export const EFFECT_NAMES = ["distortion", "vibrato", "chorus", "phaser", "tremolo", "delay", "reverb"];

export const PRESETS = {
  // Always sounds good: stepped notes in a pentatonic scale.
  guided: { snap: true, scale: "majPent", octaves: 2, bendRange: 0, noteGuide: true },
  // Continuous glissando across every pitch.
  free: { snap: false, octaves: 2, bendRange: 0, noteGuide: true },
};

export function defaultSettings() {
  return {
    surface: "gradient", // "gradient" | "piano"
    waveform: "sine",
    colorMode: "sweep", // "sweep" | "repeat"
    volume: 0.6,
    scale: "majPent",
    snap: true,
    octaves: 2,
    bendRange: 0,
    noteGuide: true,
    effects: Object.fromEntries(EFFECT_NAMES.map((n) => [n, false])),
  };
}

export function applyPreset(settings, name) {
  Object.assign(settings, PRESETS[name]);
}

// Which preset (if any) do the current settings match? "custom" when the user tweaked anything.
export function styleOf(settings) {
  for (const [name, preset] of Object.entries(PRESETS)) {
    if (Object.entries(preset).every(([k, v]) => settings[k] === v)) return name;
  }
  return "custom";
}

const ENUMS = {
  surface: ["gradient", "piano"],
  waveform: ["sine", "triangle", "sawtooth", "square"],
  colorMode: ["sweep", "repeat"],
  scale: ["majPent", "minPent", "major", "minor", "chromatic"],
};
const RANGES = { volume: [0, 1], octaves: [1, 4], bendRange: [0, 24] };

// Merge saved values over defaults, accepting only well-typed known keys.
export function sanitize(saved) {
  const out = defaultSettings();
  if (!saved || typeof saved !== "object") return out;
  for (const [k, allowed] of Object.entries(ENUMS)) {
    if (allowed.includes(saved[k])) out[k] = saved[k];
  }
  for (const [k, [lo, hi]] of Object.entries(RANGES)) {
    if (typeof saved[k] === "number" && Number.isFinite(saved[k])) out[k] = Math.min(hi, Math.max(lo, saved[k]));
  }
  out.octaves = Math.round(out.octaves);
  out.bendRange = Math.round(out.bendRange);
  for (const k of ["snap", "noteGuide"]) if (typeof saved[k] === "boolean") out[k] = saved[k];
  if (saved.effects && typeof saved.effects === "object") {
    for (const n of EFFECT_NAMES) if (typeof saved.effects[n] === "boolean") out.effects[n] = saved.effects[n];
  }
  return out;
}

// Storage can throw (private windows, blocked site data) — the app must work without it.
export function loadSettings(storage = globalThis.localStorage) {
  try {
    return sanitize(JSON.parse(storage.getItem(STORAGE_KEY)));
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
