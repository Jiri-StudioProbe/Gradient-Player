// Pure pitch / scale maths. No DOM, no audio — shared by rendering, input and tests.
// Pitch is "absolute semitones from C0" (Scientific Pitch Notation): C4 = 48.

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const C0_FREQ = 16.3516; // C0 at A4 = 440 Hz
export const CENTER_ABS_SEMI = 48; // C4, middle C

export const SCALES = {
  majPent: [0, 2, 4, 7, 9],
  minPent: [0, 3, 5, 7, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

// 88-key piano: A0 (9) to C8 (96).
export const PIANO_RANGE = { startAbs: 9, totalSemis: 87 };

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Visible range of the gradient surface: symmetric around C4.
export function gradientRange(octaves) {
  const totalSemis = octaves * 12;
  return { totalSemis, startAbs: CENTER_ABS_SEMI - totalSemis / 2 };
}

// Every absolute semitone in the active scale across the visible range.
// Shared by audio snapping and the overlay so they cannot drift apart.
export function scaleNotesInRange(scaleName, octaves) {
  const scale = SCALES[scaleName];
  const { totalSemis, startAbs } = gradientRange(octaves);
  const notes = [];
  for (let i = 0; i <= totalSemis; i++) {
    const abs = startAbs + i;
    if (scale.includes(((abs % 12) + 12) % 12)) notes.push(abs);
  }
  return notes;
}

export function nearestNote(notes, absSemi) {
  let best = notes[0];
  let bestDist = Infinity;
  for (const n of notes) {
    const d = Math.abs(n - absSemi);
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  return best;
}

export function freqFromSemis(semis) {
  return C0_FREQ * Math.pow(2, semis / 12);
}

// +1 at the top edge, -1 at the bottom edge, 0 at vertical centre, times the dialled-in range.
export function bendSemisFromY(y, h, bendRange) {
  if (!bendRange) return 0;
  return clamp((h / 2 - y) / (h / 2), -1, 1) * bendRange;
}

// X picks the note (snapped to the scale when snap is on, continuous otherwise);
// Y then bends continuously away from it.
export function pitchFromXY(settings, x, y, w, h) {
  const { totalSemis, startAbs } = gradientRange(settings.octaves);
  const t = clamp(x / w, 0, 1);
  let note = startAbs + t * totalSemis;
  if (settings.snap) note = nearestNote(scaleNotesInRange(settings.scale, settings.octaves), note);
  const bend = bendSemisFromY(y, h, settings.bendRange);
  const pitch = note + bend;
  return { freq: freqFromSemis(pitch), note, bend, pitch };
}

// Zone boundaries: the midpoint between neighbouring notes — exactly where snapping flips.
export function zoneEdges(notes, startAbs, totalSemis) {
  const edges = [startAbs];
  for (let i = 0; i < notes.length - 1; i++) edges.push((notes[i] + notes[i + 1]) / 2);
  edges.push(startAbs + totalSemis);
  return edges;
}

export function noteNameFromSemis(semis) {
  const rounded = Math.round(semis);
  return NOTE_NAMES[((rounded % 12) + 12) % 12] + Math.floor(rounded / 12);
}

export function pitchClass(absSemi) {
  return ((Math.round(absSemi) % 12) + 12) % 12;
}
