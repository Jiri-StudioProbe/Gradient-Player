import test from "node:test";
import assert from "node:assert/strict";
import {
  gradientRange,
  scaleNotesInRange,
  nearestNote,
  pitchFromXY,
  zoneEdges,
  noteNameFromSemis,
  bendSemisFromY,
  freqFromSemis,
  PIANO_RANGE,
} from "../js/pitch.js";

const base = { snap: false, scale: "chromatic", octaves: 2, bendRange: 0 };

test("noteNameFromSemis: C4 is 48 semitones above C0, no stray octave offset (Bug A)", () => {
  assert.equal(noteNameFromSemis(48), "C4");
  assert.equal(noteNameFromSemis(9), "A0");
  assert.equal(noteNameFromSemis(96), "C8");
  assert.equal(noteNameFromSemis(61), "C#5");
});

test("2-octave range is C3-C5 and screen centre resolves to exactly C4 (Bug A)", () => {
  const { startAbs, totalSemis } = gradientRange(2);
  assert.equal(noteNameFromSemis(startAbs), "C3");
  assert.equal(noteNameFromSemis(startAbs + totalSemis), "C5");
  const p = pitchFromXY(base, 200, 400, 400, 800);
  assert.equal(p.note, 48);
  assert.ok(Math.abs(p.freq - 261.63) < 0.05);
});

test("3-octave range edges are F#2 and F#5 (half an octave each side, so not on a C)", () => {
  const { startAbs, totalSemis } = gradientRange(3);
  assert.equal(noteNameFromSemis(startAbs), "F#2");
  assert.equal(noteNameFromSemis(startAbs + totalSemis), "F#5");
});

test("piano range is the 88 keys A0..C8", () => {
  assert.equal(noteNameFromSemis(PIANO_RANGE.startAbs), "A0");
  assert.equal(noteNameFromSemis(PIANO_RANGE.startAbs + PIANO_RANGE.totalSemis), "C8");
  assert.equal(PIANO_RANGE.totalSemis + 1, 88);
});

test("snap on: every X lands on a scale note; flips at the midpoint between neighbours", () => {
  const s = { ...base, snap: true, scale: "majPent" };
  const notes = scaleNotesInRange("majPent", 2);
  for (let x = 0; x <= 400; x += 3) {
    const { note } = pitchFromXY(s, x, 400, 400, 800);
    assert.ok(notes.includes(note), `x=${x} -> ${note}`);
  }
  // neighbours of C4 (48) in C major pentatonic are A3 (45) and D4 (50): the A3/C4 boundary is 46.5
  const { startAbs, totalSemis } = gradientRange(2);
  const xAtSemi = (semi) => ((semi - startAbs) / totalSemis) * 400;
  assert.equal(pitchFromXY(s, xAtSemi(46.4), 0, 400, 800).note, 45);
  assert.equal(pitchFromXY(s, xAtSemi(46.6), 0, 400, 800).note, 48);
});

test("snap off: pitch is continuous (fractional semitones)", () => {
  const p = pitchFromXY(base, 123, 400, 400, 800);
  assert.notEqual(p.note, Math.round(p.note));
});

test("zone edges sit at midpoints between neighbouring notes and span the full range", () => {
  const notes = scaleNotesInRange("majPent", 2);
  const { startAbs, totalSemis } = gradientRange(2);
  const edges = zoneEdges(notes, startAbs, totalSemis);
  assert.equal(edges.length, notes.length + 1);
  assert.equal(edges[0], startAbs);
  assert.equal(edges.at(-1), startAbs + totalSemis);
  for (let i = 1; i < edges.length - 1; i++) assert.equal(edges[i], (notes[i - 1] + notes[i]) / 2);
});

test("nearestNote picks the closest note", () => {
  assert.equal(nearestNote([40, 45, 50], 47), 45);
  assert.equal(nearestNote([40, 45, 50], 48), 50);
});

test("vertical bend: +range at top, 0 at centre, -range at bottom, off when 0", () => {
  assert.equal(bendSemisFromY(0, 800, 12), 12);
  assert.equal(bendSemisFromY(400, 800, 12), 0);
  assert.equal(bendSemisFromY(800, 800, 12), -12);
  assert.equal(bendSemisFromY(0, 800, 0), 0);
  assert.equal(bendSemisFromY(-50, 800, 12), 12); // clamped
});

test("bend is layered on top of the X note, in semitones", () => {
  const s = { ...base, bendRange: 12 };
  const mid = pitchFromXY(s, 200, 400, 400, 800);
  const top = pitchFromXY(s, 200, 0, 400, 800);
  assert.ok(Math.abs(top.freq / mid.freq - 2) < 1e-9);
  assert.equal(top.note, mid.note);
});

test("A4 = 440 Hz", () => {
  assert.ok(Math.abs(freqFromSemis(57) - 440) < 0.01);
});
