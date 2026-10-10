// App controller: settings UI, pointer input, wiring between settings, audio and rendering.
import {
  clamp,
  pitchFromXY,
  gradientRange,
  scaleNotesInRange,
  noteNameFromSemis,
  freqFromSemis,
} from "./pitch.js";
import { keyAt, panFromScrubX, movedEnough, pinReleased } from "./piano.js";
import { createEngine } from "./audio.js";
import { createRenderer } from "./render.js";
import {
  EFFECT_NAMES,
  loadSettings,
  saveSettings,
  applyPreset,
  styleOf,
} from "./settings.js";

const $ = (id) => document.getElementById(id);

const settings = loadSettings();
const engine = createEngine({ initialVolume: settings.volume, initialEffects: settings.effects });

const canvas = $("surface");
const renderer = createRenderer({
  canvas,
  guideCanvas: $("note-guide"),
  safeProbe: $("safe-probe"),
  getSettings: () => settings,
  getActiveNotes: () => engine.activePianoNotes(),
});

// ---------- settings UI ----------
const panel = $("panel");
const gear = $("gear");

const STYLE_NOTES = {
  guided: "Notes snap to a pentatonic scale, so it always sounds good.",
  free: "Slide continuously through every pitch, like a theremin.",
  custom: "Custom: you've changed individual settings.",
};
const EFFECT_LABELS = { delay: "Delay / echo" };

function setActive(container, value) {
  container.querySelectorAll("button").forEach((b) => {
    const v = b.dataset.v ?? b.dataset.style;
    b.classList.toggle("active", v === value);
    b.setAttribute("aria-pressed", String(v === value));
  });
}

function setSwitch(el, on) {
  el.classList.toggle("on", on);
  el.setAttribute("aria-checked", String(on));
}

function setRowEnabled(id, enabled) {
  $(id).classList.toggle("disabled", !enabled);
}

function hintText() {
  if (settings.surface === "piano") return "Tap keys to play · drag the bar at the bottom to scroll";
  const bend = settings.bendRange > 0 ? " · slide up or down to bend pitch" : "";
  return "Touch and drag to play · two fingers for a chord" + bend;
}

function syncUI() {
  const isPiano = settings.surface === "piano";
  document.body.classList.toggle("piano", isPiano);

  const style = styleOf(settings);
  setActive($("style-seg"), style);
  setActive($("style-switch"), style);
  $("style-note").textContent = STYLE_NOTES[style];
  setActive($("surface-seg"), settings.surface);
  setActive($("wave-seg"), settings.waveform);
  setActive($("color-seg"), settings.colorMode);
  setSwitch($("snap-switch"), settings.snap);
  setSwitch($("guide-switch"), settings.noteGuide);
  $("scale-select").value = settings.scale;
  $("bend-slider").value = settings.bendRange;
  $("range-slider").value = settings.octaves;
  $("vol-slider").value = settings.volume;
  EFFECT_NAMES.forEach((n) => setSwitch($(`fx-${n}`), settings.effects[n]));

  // The gradient-only controls do nothing on the piano.
  ["style-row", "wave-row", "snap-row", "color-row", "bend-row", "range-row"].forEach((id) => setRowEnabled(id, !isPiano));
  setRowEnabled("scale-row", !isPiano && settings.snap);

  const bend = settings.bendRange;
  $("bend-label").textContent = bend === 0 ? "off" : `±${bend} semitones (±${+(bend / 12).toFixed(2)} oct)`;
  const { totalSemis, startAbs } = gradientRange(settings.octaves);
  const span = `${noteNameFromSemis(startAbs)} – ${noteNameFromSemis(startAbs + totalSemis)}`;
  $("range-label").textContent = settings.snap
    ? `${span} · ${scaleNotesInRange(settings.scale, settings.octaves).length} notes in scale`
    : `${span} · continuous`;

  $("hint").textContent = hintText();
}

function commit() {
  saveSettings(settings);
  syncUI();
  renderer.render();
}

function buildEffectRows() {
  const host = $("effects");
  EFFECT_NAMES.forEach((name) => {
    const row = document.createElement("div");
    row.className = "row toggle-row";
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = EFFECT_LABELS[name] || name[0].toUpperCase() + name.slice(1);
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "switch";
    sw.id = `fx-${name}`;
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-label", label.textContent);
    sw.addEventListener("click", () => {
      settings.effects[name] = !settings.effects[name];
      engine.setEffect(name, settings.effects[name]);
      commit();
    });
    row.append(label, sw);
    host.append(row);
  });
}

function bindSegmented(id, onPick) {
  $(id).querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => onPick(btn.dataset.v ?? btn.dataset.style)));
}

function setPanelOpen(open) {
  panel.classList.toggle("open", open);
  gear.setAttribute("aria-expanded", String(open));
}
const isPanelOpen = () => panel.classList.contains("open");

function wireUI() {
  buildEffectRows();
  gear.addEventListener("click", () => setPanelOpen(!isPanelOpen()));

  // EVALUATION SWITCH — the Guided/Free preset (panel control and the on-screen pill).
  const pickStyle = (name) => {
    if (name === "guided" || name === "free") {
      applyPreset(settings, name);
      commit();
    }
  };
  bindSegmented("style-seg", pickStyle);
  bindSegmented("style-switch", pickStyle);

  bindSegmented("surface-seg", (v) => {
    if (settings.surface === v) return;
    releaseAllPointers();
    settings.surface = v;
    if (v === "piano") renderer.centerOnC4();
    commit();
  });
  bindSegmented("wave-seg", (v) => {
    settings.waveform = v;
    commit();
  });
  bindSegmented("color-seg", (v) => {
    settings.colorMode = v;
    commit();
  });

  $("snap-switch").addEventListener("click", () => {
    settings.snap = !settings.snap;
    commit();
  });
  $("guide-switch").addEventListener("click", () => {
    settings.noteGuide = !settings.noteGuide;
    commit();
  });
  $("scale-select").addEventListener("change", (e) => {
    settings.scale = e.target.value;
    commit();
  });
  $("bend-slider").addEventListener("input", (e) => {
    settings.bendRange = parseInt(e.target.value, 10);
    commit();
  });
  $("range-slider").addEventListener("input", (e) => {
    settings.octaves = parseInt(e.target.value, 10);
    commit();
  });
  $("vol-slider").addEventListener("input", (e) => {
    settings.volume = parseFloat(e.target.value);
    engine.setVolume(settings.volume);
    saveSettings(settings);
  });
}

// ---------- hint ----------
let hintShown = true;
function hideHint() {
  if (!hintShown) return;
  hintShown = false;
  $("hint").style.opacity = "0";
}

// ---------- pointer input ----------
const readouts = new Map(); // pointerId -> element
const pointers = new Map(); // pointerId -> { kind: "gradient" | "piano" | "scrub", ... }

function showReadout(id, x, y, name, freq) {
  let el = readouts.get(id);
  if (!el) {
    el = document.createElement("div");
    el.className = "readout";
    el.innerHTML = '<div class="ring"></div><div class="tag"><span class="n"></span><span class="hz"></span></div>';
    $("overlay").appendChild(el);
    readouts.set(id, el);
  }
  el.style.left = x + "px";
  el.style.top = y + "px";
  el.querySelector(".n").textContent = name;
  el.querySelector(".hz").textContent = Math.round(freq) + " Hz";
}

function removeReadout(id) {
  const el = readouts.get(id);
  if (el) {
    el.remove();
    readouts.delete(id);
  }
}

function releasePointer(id) {
  const p = pointers.get(id);
  if (!p) return;
  if (p.kind === "gradient") engine.stopVoice(id);
  else if (p.kind === "piano") engine.stopPianoVoice(id);
  pointers.delete(id);
  removeReadout(id);
}

function releaseAllPointers() {
  [...pointers.keys()].forEach(releasePointer);
  engine.stopAll();
}

const brightnessAt = (y, h) => 1 - clamp(y / h, 0, 1);

function scrubTo(x) {
  const { W } = renderer.metrics();
  if (renderer.setPan(panFromScrubX(renderer.layout, x, W))) {
    // The keyboard moved under any fingers already holding keys: pin them so the shift
    // is never misread as a slide to a different key.
    pointers.forEach((p) => {
      if (p.kind === "piano") p.pin = { x: p.last.x, y: p.last.y };
    });
    renderer.render();
  }
}

canvas.addEventListener("pointerdown", (e) => {
  // The first tap while the settings panel is open just dismisses it — it must not also play.
  if (isPanelOpen()) {
    setPanelOpen(false);
    return;
  }
  hideHint();
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* pointer already gone */
  }

  const { W, H, keyH } = renderer.metrics();
  const id = e.pointerId;
  const x = e.clientX;
  const y = e.clientY;

  if (settings.surface === "piano") {
    if (y >= keyH) {
      pointers.set(id, { kind: "scrub" });
      scrubTo(x);
      return;
    }
    const abs = keyAt(renderer.layout, renderer.getPan(), x, y, keyH);
    if (abs === null) return;
    pointers.set(id, { kind: "piano", abs, last: { x, y }, pin: null });
    engine.startPianoVoice(id, abs);
    showReadout(id, x, y, noteNameFromSemis(abs), freqFromSemis(abs));
    renderer.render();
    return;
  }

  const pitch = pitchFromXY(settings, x, y, W, H);
  pointers.set(id, { kind: "gradient" });
  engine.startVoice(id, { freq: pitch.freq, brightness: brightnessAt(y, H), waveform: settings.waveform });
  showReadout(id, x, y, noteNameFromSemis(pitch.pitch), pitch.freq);
});

canvas.addEventListener("pointermove", (e) => {
  const id = e.pointerId;
  const p = pointers.get(id);
  if (!p) return; // e.g. a hovering mouse
  const { W, H, keyH } = renderer.metrics();
  const x = e.clientX;

  if (p.kind === "scrub") {
    scrubTo(x);
    return;
  }

  if (p.kind === "gradient") {
    const pitch = pitchFromXY(settings, x, e.clientY, W, H);
    engine.updateVoice(id, { freq: pitch.freq, brightness: brightnessAt(e.clientY, H) });
    showReadout(id, x, e.clientY, noteNameFromSemis(pitch.pitch), pitch.freq);
    return;
  }

  // Piano. A finger drifting down onto the scrub strip keeps playing the key above it.
  const y = Math.min(e.clientY, keyH - 1);
  if (!movedEnough(p.last, x, y)) return;
  p.last = { x, y };
  if (p.pin) {
    if (!pinReleased(p.pin, x, y)) return;
    p.pin = null;
  }
  const abs = keyAt(renderer.layout, renderer.getPan(), x, y, keyH);
  if (abs === null) return;
  if (abs !== p.abs) {
    engine.stopPianoVoice(id);
    engine.startPianoVoice(id, abs);
    p.abs = abs;
    renderer.render();
  }
  showReadout(id, x, e.clientY, noteNameFromSemis(abs), freqFromSemis(abs));
});

function endPointer(e) {
  const wasPiano = pointers.get(e.pointerId)?.kind === "piano";
  releasePointer(e.pointerId);
  if (wasPiano) renderer.render();
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("lostpointercapture", endPointer);

// ---------- audio lifecycle (iOS) ----------
// iOS only lets a user gesture start audio, and can suspend/"interrupt" it later (phone call,
// switching apps). touchend / click / pointerup count as user activation — pointerdown does not.
["pointerup", "touchend", "click"].forEach((type) =>
  document.addEventListener(type, () => {
    if (!$("start").classList.contains("hidden")) return; // wait for the explicit start tap
    if (!engine.isRunning()) engine.ensureAudio();
  }, { capture: true, passive: true })
);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    releaseAllPointers(); // no notes left hanging while the app is in the background
    setPanelOpen(false);
  }
});

$("start-btn").addEventListener("click", () => {
  engine.ensureAudio();
  $("start").classList.add("hidden");
});

// iOS Safari ignores user-scalable=no; block pinch-zoom and the long-press menu directly.
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("contextmenu", (e) => e.preventDefault());

// ---------- boot ----------
function boot() {
  wireUI();
  renderer.resize();
  if (settings.surface === "piano") renderer.centerOnC4();
  syncUI();
  renderer.render();
  window.addEventListener("resize", () => renderer.resize());
  window.addEventListener("orientationchange", () => renderer.resize());

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
boot();
