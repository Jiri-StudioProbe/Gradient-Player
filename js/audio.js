// Web Audio engine: gradient voices, piano voices, effects rack, iOS audio quirks.
// The AudioContext constructor is injectable so the real code paths can be tested against a stub.
import { C0_FREQ, clamp } from "./pitch.js";

// Fixed per-effect behaviour. "replace" effects drop the dry signal while on (a distortion pedal
// does not leave a clean signal underneath it); "blend" effects mix wet over dry.
export const EFFECT_CONFIG = {
  distortion: { mode: "replace", wet: 0.9 },
  vibrato: { mode: "replace", wet: 0.95 },
  chorus: { mode: "blend", wet: 0.5 },
  phaser: { mode: "blend", wet: 0.55 },
  tremolo: { mode: "replace", wet: 1.0 },
  delay: { mode: "blend", wet: 0.35 },
  reverb: { mode: "blend", wet: 0.3 },
};

// Each builder wires `entry` (a gain node) through the effect and returns the output node.
// Builders run lazily the first time an effect is switched on.
const BUILDERS = {
  distortion(ctx, entry) {
    const shaper = ctx.createWaveShaper();
    const n = 44100;
    const curve = new Float32Array(n);
    const amount = 35;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * (20 * Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
    }
    shaper.curve = curve;
    shaper.oversample = "2x";
    entry.connect(shaper);
    return shaper;
  },

  // Vibrato and chorus share one primitive: a short delay line whose length an LFO wobbles,
  // producing a Doppler-like pitch modulation. They differ in depth, rate and dry mix.
  vibrato(ctx, entry) {
    return modulatedDelay(ctx, entry, { base: 0.006, rate: 5.5, depth: 0.0028 });
  },
  chorus(ctx, entry) {
    return modulatedDelay(ctx, entry, { base: 0.022, rate: 0.8, depth: 0.004 });
  },

  // Four allpass filters sweeping together; the moving notches make the "whoosh".
  phaser(ctx, entry) {
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.35;
    const depth = ctx.createGain();
    depth.gain.value = 700;
    lfo.connect(depth);
    let node = entry;
    for (let i = 0; i < 4; i++) {
      const ap = ctx.createBiquadFilter();
      ap.type = "allpass";
      ap.frequency.value = 700;
      depth.connect(ap.frequency);
      node.connect(ap);
      node = ap;
    }
    lfo.start();
    return node;
  },

  // An LFO swings this stage's gain between 0 and 1.
  tremolo(ctx, entry) {
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 5;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    const tr = ctx.createGain();
    tr.gain.value = 0.5;
    lfo.connect(depth);
    depth.connect(tr.gain);
    lfo.start();
    entry.connect(tr);
    return tr;
  },

  delay(ctx, entry) {
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.28;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    entry.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    return delay;
  },

  // Synthetic impulse response (decaying noise) — keeps the app free of external assets.
  reverb(ctx, entry) {
    const duration = 2.5;
    const decay = 3.2;
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const impulse = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    entry.connect(convolver);
    return convolver;
  },
};

function modulatedDelay(ctx, entry, { base, rate, depth }) {
  const delay = ctx.createDelay(0.05);
  delay.delayTime.value = base;
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = rate;
  const amount = ctx.createGain();
  amount.gain.value = depth;
  lfo.connect(amount);
  amount.connect(delay.delayTime);
  lfo.start();
  entry.connect(delay);
  return delay;
}

const EFFECT_ORDER = ["distortion", "vibrato", "chorus", "phaser", "tremolo", "delay", "reverb"];

// An "insert": dry and wet paths summed. The wet chain is built on first use and is only fed
// while the effect is on, so idle effects cost (almost) nothing on a phone.
function createInsert(ctx, input, name) {
  const { mode, wet: wetAmount } = EFFECT_CONFIG[name];
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const sum = ctx.createGain();
  const entry = ctx.createGain();
  wet.gain.value = 0;
  input.connect(dry);
  dry.connect(sum);
  wet.connect(sum);

  let built = false;
  let fed = false;
  let on = false;
  let offTimer = null;

  return {
    output: sum,
    setOn(next) {
      on = next;
      const now = ctx.currentTime;
      if (mode === "replace") dry.gain.setTargetAtTime(on ? 0 : 1, now, 0.05);
      clearTimeout(offTimer);
      if (on) {
        if (!built) {
          BUILDERS[name](ctx, entry).connect(wet);
          built = true;
        }
        if (!fed) {
          input.connect(entry);
          fed = true;
        }
        wet.gain.setTargetAtTime(wetAmount, now, 0.05);
      } else {
        wet.gain.setTargetAtTime(0, now, 0.05);
        offTimer = setTimeout(() => {
          if (!on && fed) {
            try {
              input.disconnect(entry);
            } catch {
              /* already disconnected */
            }
            fed = false;
          }
        }, 600);
      }
    },
  };
}

// A short silent WAV, generated in code so the app needs no asset files.
function makeSilentWavUrl() {
  const sampleRate = 8000;
  const samples = 800; // 0.1 s
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples * 2, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

export function createEngine({ AudioContextCtor, initialVolume = 0.6, initialEffects = {} } = {}) {
  const Ctor = AudioContextCtor || globalThis.AudioContext || globalThis.webkitAudioContext;

  let ctx = null;
  let masterGain = null;
  let volume = initialVolume;
  const effectState = { ...initialEffects };
  const inserts = {};
  let silentEl = null;

  const voices = new Map(); // pointerId -> gradient voice
  const pianoVoices = new Map(); // pointerId -> piano voice
  // What is currently sounding for each pitch, held or still fading its tail.
  const ringingByNote = new Map();

  function isIOS() {
    const nav = globalThis.navigator;
    if (!nav) return false;
    // iPadOS reports itself as a Mac, but with a touch screen
    return /iP(hone|ad|od)/.test(nav.userAgent || "") || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  }

  // iOS mutes Web Audio when the hardware silent switch is on, unless the page counts as
  // "playback" audio. Newer iOS has navigator.audioSession; older iOS needs a looping silent
  // <audio> element. The fallback is iOS-only: elsewhere it would just add a "now playing" card.
  function unlockSilentSwitch() {
    try {
      if (globalThis.navigator && "audioSession" in navigator) {
        navigator.audioSession.type = "playback";
        return;
      }
      if (!silentEl && isIOS() && globalThis.document) {
        silentEl = document.createElement("audio");
        silentEl.src = makeSilentWavUrl();
        silentEl.loop = true;
        silentEl.setAttribute("playsinline", "");
        silentEl.play().catch(() => {});
      }
    } catch {
      /* best effort */
    }
  }

  function buildGraph() {
    masterGain = ctx.createGain();
    masterGain.gain.value = volume;
    let node = masterGain;
    for (const name of EFFECT_ORDER) {
      const insert = createInsert(ctx, node, name);
      inserts[name] = insert;
      if (effectState[name]) insert.setOn(true);
      node = insert.output;
    }
    const comp = ctx.createDynamicsCompressor();
    node.connect(comp);
    comp.connect(ctx.destination);
  }

  // Create (once) and wake the context. Safe to call on every gesture: iOS can suspend or
  // "interrupt" the context (phone call, backgrounding) and only a user gesture can resume it.
  function ensureAudio() {
    if (!ctx) {
      ctx = new Ctor({ latencyHint: "interactive" });
      buildGraph();
    }
    unlockSilentSwitch();
    if (ctx.state !== "running" && typeof ctx.resume === "function") {
      const p = ctx.resume();
      if (p && p.catch) p.catch(() => {});
    }
    return ctx;
  }

  // ---- gradient voice: sustained, held for as long as the finger is down ----
  function startVoice(id, { freq, brightness, waveform }) {
    ensureAudio();
    const osc = ctx.createOscillator();
    osc.type = waveform;
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.7;
    filter.frequency.value = cutoffFor(brightness);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    osc.start();
    gain.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.015);
    const voice = { osc, gain, filter };
    voices.set(id, voice);
    osc.onended = () => disconnectAll(osc, filter, gain);
  }

  function updateVoice(id, { freq, brightness }) {
    const v = voices.get(id);
    if (!v || !ctx) return;
    const now = ctx.currentTime;
    v.osc.frequency.setTargetAtTime(freq, now, 0.045);
    v.filter.frequency.setTargetAtTime(cutoffFor(brightness), now, 0.06);
  }

  function stopVoice(id) {
    const v = voices.get(id);
    if (!v || !ctx) return;
    releaseGain(v.gain.gain, ctx.currentTime, 0.06);
    v.osc.stop(ctx.currentTime + 0.4);
    voices.delete(id);
  }

  // ---- piano voice: struck once, then self-decaying ----
  function startPianoVoice(id, absSemi) {
    ensureAudio();

    // Striking a pitch that is still ringing (held by another finger, or just released and fading
    // its tail) would layer two near-identical waveforms at a random phase — an audible click.
    // Cut the old one fast first.
    const prior = ringingByNote.get(absSemi);
    if (prior) {
      const t = ctx.currentTime;
      prior.gain.gain.cancelScheduledValues(t);
      prior.gain.gain.setTargetAtTime(0, t, 0.012);
      prior.osc1.stop(t + 0.04);
      prior.osc2.stop(t + 0.04);
    }

    const freq = C0_FREQ * Math.pow(2, absSemi / 12);
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    osc1.type = "triangle";
    osc1.frequency.value = freq;
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = freq;
    osc2.detune.value = 6; // slight beating, like a real string pair

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.5;
    filter.frequency.setValueAtTime(6500, now);
    filter.frequency.setTargetAtTime(1100, now, 0.35); // brightness fades as the note ages

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    osc1.start();
    osc2.start();

    // Hammer strike, then decay. The decay must start exactly when the attack ramp ends —
    // overlapping automation events on one param produce a click.
    const ATTACK = 0.008;
    gain.gain.linearRampToValueAtTime(0.85, now + ATTACK);
    gain.gain.setTargetAtTime(0.22, now + ATTACK, 0.35);
    gain.gain.setTargetAtTime(0.05, now + 0.35, 2.2);

    const voice = { absSemi, osc1, osc2, filter, gain };
    pianoVoices.set(id, voice);
    ringingByNote.set(absSemi, voice);
    osc1.onended = () => {
      disconnectAll(osc1, osc2, filter, gain);
      // Only clear the registry if it still points at *this* voice, so a late cleanup
      // cannot clobber a newer voice for the same note.
      if (ringingByNote.get(absSemi) === voice) ringingByNote.delete(absSemi);
    };
  }

  function stopPianoVoice(id) {
    const v = pianoVoices.get(id);
    if (!v || !ctx) return;
    const now = ctx.currentTime;
    releaseGain(v.gain.gain, now, 0.15); // damper falling
    v.osc1.stop(now + 0.6);
    v.osc2.stop(now + 0.6);
    pianoVoices.delete(id);
  }

  function stopAll() {
    [...voices.keys()].forEach(stopVoice);
    [...pianoVoices.keys()].forEach(stopPianoVoice);
  }

  function setVolume(v) {
    volume = v;
    if (masterGain) masterGain.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  }

  function setEffect(name, on) {
    effectState[name] = on;
    if (inserts[name]) inserts[name].setOn(on);
  }

  return {
    ensureAudio,
    startVoice,
    updateVoice,
    stopVoice,
    startPianoVoice,
    stopPianoVoice,
    stopAll,
    setVolume,
    setEffect,
    isRunning: () => !!ctx && ctx.state === "running",
    activePianoNotes: () => new Set([...pianoVoices.values()].map((v) => v.absSemi)),
    // exposed for tests / diagnostics
    _ringingByNote: ringingByNote,
    _pianoVoices: pianoVoices,
    _voices: voices,
    getContext: () => ctx,
  };
}

// Y brightness: top of the surface is bright, bottom is muted.
export function cutoffFor(brightness) {
  return 300 + clamp(brightness, 0, 1) * 7000;
}

// Hold the current level, then fall — cancelling the schedule alone would snap the gain
// to its pre-automation value and click.
function releaseGain(param, now, timeConstant) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.setTargetAtTime(0, now, timeConstant);
}

function disconnectAll(...nodes) {
  for (const n of nodes) {
    try {
      n.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}
