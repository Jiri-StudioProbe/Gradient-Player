import test from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "../js/audio.js";
import { FakeAudioContext } from "./fake-audio.mjs";

function makeEngine(opts = {}) {
  FakeAudioContext.instances.length = 0;
  const engine = createEngine({ AudioContextCtor: FakeAudioContext, ...opts });
  engine.ensureAudio();
  return { engine, ctx: engine.getContext() };
}

const lastStop = (node) => node.stops.at(-1);

test("ensureAudio creates one low-latency context and wakes it", () => {
  const { engine, ctx } = makeEngine();
  engine.ensureAudio();
  assert.equal(FakeAudioContext.instances.length, 1);
  assert.equal(ctx.opts.latencyHint, "interactive");
  assert.equal(ctx.state, "running");
});

test("ensureAudio resumes a context that was suspended or interrupted later (iOS)", () => {
  const { engine, ctx } = makeEngine();
  const before = ctx.resumeCalls;
  ctx.state = "interrupted";
  engine.ensureAudio();
  assert.equal(ctx.resumeCalls, before + 1);
});

test("Bug B: piano decay stage starts exactly when the attack ramp ends, never overlapping it", () => {
  const { engine, ctx } = makeEngine();
  const now = ctx.currentTime;
  engine.startPianoVoice(1, 60);
  const gain = engine._pianoVoices.get(1).gain.gain;
  const ramp = gain.events.find((e) => e.type === "ramp");
  assert.ok(ramp, "attack ramp scheduled");
  assert.ok(Math.abs(ramp.t - (now + 0.008)) < 1e-9);
  assert.equal(ramp.v, 0.85);
  for (const e of gain.events.filter((e) => e.type === "target")) {
    assert.ok(e.t >= ramp.t - 1e-9, `decay at ${e.t} must not start before the attack ends at ${ramp.t}`);
  }
});

test("Bug C: re-striking a pitch that is still ringing cuts the old voice fast", () => {
  const { engine, ctx } = makeEngine();
  engine.startPianoVoice(1, 60);
  const first = engine._pianoVoices.get(1);
  engine.stopPianoVoice(1); // released: tail would ring for 0.6s
  assert.ok(Math.abs(lastStop(first.osc1) - (ctx.currentTime + 0.6)) < 1e-9);
  engine.startPianoVoice(2, 60); // same pitch struck again straight away
  assert.ok(lastStop(first.osc1) <= ctx.currentTime + 0.04 + 1e-9, "old oscillators cut within ~40ms");
  assert.ok(lastStop(first.osc2) <= ctx.currentTime + 0.04 + 1e-9);
  const cut = first.gain.gain.events.at(-1);
  assert.equal(cut.type, "target");
  assert.equal(cut.v, 0);
  assert.ok(cut.tc <= 0.015, "fast fade");
});

test("Bug C: striking a pitch held by another finger also cuts the held voice", () => {
  const { engine, ctx } = makeEngine();
  engine.startPianoVoice(1, 64);
  const held = engine._pianoVoices.get(1);
  engine.startPianoVoice(2, 64);
  assert.ok(lastStop(held.osc1) <= ctx.currentTime + 0.04 + 1e-9);
});

test("Bug C: a late cleanup of an old voice cannot clobber the newer voice for that note", () => {
  const { engine } = makeEngine();
  engine.startPianoVoice(1, 60);
  const old = engine._pianoVoices.get(1);
  engine.stopPianoVoice(1);
  engine.startPianoVoice(2, 60);
  const fresh = engine._pianoVoices.get(2);
  old.osc1.onended(); // the old oscillator finishes after the new one started
  assert.equal(engine._ringingByNote.get(60), fresh);
  fresh.osc1.onended();
  assert.equal(engine._ringingByNote.has(60), false);
});

test("different pitches never cut each other", () => {
  const { engine, ctx } = makeEngine();
  engine.startPianoVoice(1, 60);
  const a = engine._pianoVoices.get(1);
  engine.startPianoVoice(2, 64);
  assert.equal(a.osc1.stops.length, 0);
  assert.ok(engine.activePianoNotes().has(60) && engine.activePianoNotes().has(64));
  assert.ok(ctx);
});

test("gradient voice release holds the current level before falling (no click)", () => {
  const { engine } = makeEngine();
  engine.startVoice(7, { freq: 440, brightness: 0.5, waveform: "sine" });
  const v = engine._voices.get(7);
  engine.stopVoice(7);
  const types = v.gain.gain.events.map((e) => e.type);
  const i = types.lastIndexOf("cancel");
  assert.deepEqual(types.slice(i), ["cancel", "set", "target"]);
  assert.equal(engine._voices.has(7), false);
});

test("effects are built lazily: nothing heavy exists until an effect is switched on", () => {
  const { engine, ctx } = makeEngine();
  assert.equal(ctx.created.convolver || 0, 0);
  assert.equal(ctx.created.shaper || 0, 0);
  engine.setEffect("reverb", true);
  assert.equal(ctx.created.convolver, 1);
  engine.setEffect("reverb", false);
  engine.setEffect("reverb", true);
  assert.equal(ctx.created.convolver, 1, "built once, reused");
});

test("an effect toggled on before audio starts is applied when the graph is built", () => {
  FakeAudioContext.instances.length = 0;
  const engine = createEngine({ AudioContextCtor: FakeAudioContext, initialEffects: { reverb: true } });
  assert.equal(FakeAudioContext.instances.length, 0, "no context before a gesture");
  engine.ensureAudio();
  assert.equal(engine.getContext().created.convolver, 1);
});

test("stopAll releases every voice", () => {
  const { engine } = makeEngine();
  engine.startVoice(1, { freq: 220, brightness: 1, waveform: "sine" });
  engine.startPianoVoice(2, 60);
  engine.stopAll();
  assert.equal(engine._voices.size, 0);
  assert.equal(engine._pianoVoices.size, 0);
});
