// Canvas rendering: gradient surface, note-guide overlay, piano keyboard.
import {
  gradientRange,
  scaleNotesInRange,
  zoneEdges,
  noteNameFromSemis,
} from "./pitch.js";
import {
  computeLayout,
  clampPan,
  panToCenterOnC4,
  WHITE_KEY_W,
  BLACK_KEY_W,
  BLACK_FRACTION,
  SCRUB_H,
} from "./piano.js";

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function createRenderer({ canvas, guideCanvas, safeProbe, getSettings, getActiveNotes }) {
  const g = canvas.getContext("2d");
  const ng = guideCanvas.getContext("2d");
  const layout = computeLayout();
  let W = 0;
  let H = 0;
  let DPR = 1;
  let bottomInset = 0;
  let pan = 0;

  const keyH = () => H - bottomInset - SCRUB_H;

  function sizeCanvas(c, ctx2d) {
    c.width = W * DPR;
    c.height = H * DPR;
    c.style.width = W + "px";
    c.style.height = H + "px";
    ctx2d.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    bottomInset = safeProbe ? safeProbe.getBoundingClientRect().height : 0;
    sizeCanvas(canvas, g);
    sizeCanvas(guideCanvas, ng);
    pan = clampPan(layout, pan, W);
    render();
  }

  // ---- colour ----
  function colorForT(s, t) {
    if (s.colorMode === "repeat") {
      // Chroma circle: hue depends on pitch class only, so a note always looks the same
      // whatever the octave. Lightness steps up one band per octave (bands break at C,
      // where the hue wraps, not at the edge of the visible range).
      const { totalSemis, startAbs } = gradientRange(s.octaves);
      const abs = startAbs + t * totalSemis;
      const hue = (((abs % 12) + 12) % 12) / 12 * 360;
      const firstBand = Math.floor(startAbs / 12);
      const bands = Math.floor((startAbs + totalSemis) / 12) - firstBand + 1;
      const band = Math.floor(abs / 12) - firstBand;
      const lightness = 40 + (bands > 1 ? band / (bands - 1) : 0) * 20; // 40%..60%
      return `hsl(${hue}, 70%, ${lightness}%)`;
    }
    return `hsl(${t * 300}, 68%, 52%)`; // one hue sweep across the visible range
  }

  function drawGradient(s) {
    const steps = s.colorMode === "repeat" ? 200 : 64;
    const grad = g.createLinearGradient(0, 0, W, 0);
    for (let i = 0; i <= steps; i++) grad.addColorStop(i / steps, colorForT(s, i / steps));
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // vertical shading for the brightness axis (bottom = darker / more muted)
    const v = g.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, "rgba(255,255,255,0.12)");
    v.addColorStop(0.5, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
  }

  // ---- note guide (gradient surface only) ----
  function drawNoteGuide(s) {
    ng.clearRect(0, 0, W, H);
    if (!s.noteGuide || s.surface === "piano") return;

    const { totalSemis, startAbs } = gradientRange(s.octaves);
    const pxFor = (abs) => ((abs - startAbs) / totalSemis) * W;

    // Snap on: borders at the true boundary where the sound flips, a label at every note.
    // Snap off: pitch is continuous so there are no zones — mark only the C of each octave,
    // as landmarks.
    let notes;
    let edges;
    if (s.snap) {
      notes = scaleNotesInRange(s.scale, s.octaves);
      edges = zoneEdges(notes, startAbs, totalSemis);
    } else {
      notes = [];
      for (let abs = startAbs; abs <= startAbs + totalSemis; abs++) if (((abs % 12) + 12) % 12 === 0) notes.push(abs);
      edges = notes;
    }
    if (!notes.length) return;

    ng.lineWidth = 1;
    ng.strokeStyle = s.snap ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.35)";
    edges.forEach((abs) => {
      const x = pxFor(abs);
      ng.beginPath();
      ng.moveTo(x, 0);
      ng.lineTo(x, H);
      ng.stroke();
    });

    // With bend on, a note's name is only true at vertical centre, so labels sit there.
    const bendOn = s.bendRange > 0;
    const labelYs = bendOn ? [H / 2 - 28] : [76, H - bottomInset - 34];

    ng.font = "600 13px -apple-system, system-ui, sans-serif";
    ng.textAlign = "center";
    ng.textBaseline = "middle";
    // If neighbouring zones are too narrow for a label each, label only the Cs.
    const PAD = 10; // total horizontal padding inside a label pill
    let minGap = Infinity;
    let widest = 0;
    for (let i = 0; i < notes.length - 1; i++) minGap = Math.min(minGap, pxFor(notes[i + 1]) - pxFor(notes[i]));
    notes.forEach((abs) => (widest = Math.max(widest, ng.measureText(noteNameFromSemis(abs)).width + PAD)));
    const labelAll = minGap >= widest + 2;

    const labels = [];
    notes.forEach((abs) => {
      if (!labelAll && ((abs % 12) + 12) % 12 !== 0) return;
      const name = noteNameFromSemis(abs);
      const boxW = ng.measureText(name).width + PAD;
      // keep the pill fully on screen (the range edges sit exactly on the screen edges)
      const ideal = pxFor(abs);
      const cx = Math.min(W - boxW / 2 - 2, Math.max(boxW / 2 + 2, ideal));
      labels.push({ name, boxW, cx, clamped: cx !== ideal });
    });
    // A pill pushed in from the screen edge can land on its neighbour: drop it, keep the neighbour.
    const overlaps = (a, b) => a && b && Math.abs(a.cx - b.cx) < (a.boxW + b.boxW) / 2 + 1;
    labels
      .filter((l, i) => !(l.clamped && (overlaps(l, labels[i - 1]) || overlaps(l, labels[i + 1]))))
      .forEach(({ name, boxW, cx }) => {
        labelYs.forEach((cy) => {
          ng.fillStyle = "rgba(0,0,0,0.38)";
          roundRect(ng, cx - boxW / 2, cy - 10, boxW, 20, 6);
          ng.fill();
          ng.fillStyle = "rgba(255,255,255,0.95)";
          ng.fillText(name, cx, cy + 1);
        });
      });

    if (bendOn) {
      ng.setLineDash([5, 5]);
      ng.strokeStyle = "rgba(255,255,255,0.35)";
      ng.beginPath();
      ng.moveTo(0, H / 2);
      ng.lineTo(W, H / 2);
      ng.stroke();
      ng.setLineDash([]);
      ng.textAlign = "left";
      ng.font = "600 10px -apple-system, system-ui, sans-serif";
      ng.fillStyle = "rgba(255,255,255,0.6)";
      ng.fillText(`+${s.bendRange} st`, 8, 64);
      ng.fillText("0 st", 8, H / 2 - 8);
      ng.fillText(`−${s.bendRange} st`, 8, H - bottomInset - 12);
    }
  }

  // ---- piano ----
  function drawPiano(s) {
    const kh = keyH();
    g.fillStyle = "#0a0a0a";
    g.fillRect(0, 0, W, H);
    const active = getActiveNotes();

    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    for (const wk of layout.whiteKeys) {
      const x = wk.x - pan;
      if (x + WHITE_KEY_W < 0 || x > W) continue;
      g.fillStyle = active.has(wk.abs) ? "#cfe8ff" : "#f5f5f2";
      g.fillRect(x, 0, WHITE_KEY_W - 1, kh);
      g.strokeStyle = "rgba(0,0,0,0.25)";
      g.lineWidth = 1;
      g.strokeRect(x + 0.5, 0.5, WHITE_KEY_W - 2, kh - 1);
      if (s.noteGuide) {
        g.fillStyle = "rgba(0,0,0,0.5)";
        g.font = "500 11px -apple-system, system-ui, sans-serif";
        g.fillText(noteNameFromSemis(wk.abs), x + WHITE_KEY_W / 2, kh - 14);
      }
    }

    const blackH = kh * BLACK_FRACTION;
    for (const bk of layout.blackKeys) {
      const x = bk.x - pan;
      if (x + BLACK_KEY_W < 0 || x > W) continue;
      g.fillStyle = active.has(bk.abs) ? "#5b8fc9" : "#161616";
      g.fillRect(x, 0, BLACK_KEY_W, blackH);
      g.strokeStyle = "rgba(0,0,0,0.5)";
      g.strokeRect(x + 0.5, 0.5, BLACK_KEY_W - 1, blackH - 1);
      if (s.noteGuide) {
        g.fillStyle = "rgba(255,255,255,0.75)";
        g.font = "500 9px -apple-system, system-ui, sans-serif";
        g.fillText(noteNameFromSemis(bk.abs), x + BLACK_KEY_W / 2, blackH - 10);
      }
    }

    // scrub strip: a miniature of the whole keyboard with a window showing what is on screen
    g.fillStyle = "rgba(255,255,255,0.06)";
    g.fillRect(0, kh, W, SCRUB_H);
    const viewW = Math.max(10, (W / layout.totalWidth) * W);
    const viewX = (pan / layout.totalWidth) * W;
    g.fillStyle = "rgba(255,255,255,0.3)";
    roundRect(g, viewX, kh + 4, viewW, SCRUB_H - 8, 3);
    g.fill();
  }

  function render() {
    const s = getSettings();
    if (s.surface === "piano") drawPiano(s);
    else drawGradient(s);
    drawNoteGuide(s);
  }

  return {
    resize,
    render,
    layout,
    metrics: () => ({ W, H, keyH: keyH(), bottomInset }),
    getPan: () => pan,
    setPan(p) {
      const next = clampPan(layout, p, W);
      const changed = next !== pan;
      pan = next;
      return changed;
    },
    centerOnC4() {
      pan = panToCenterOnC4(layout, W);
    },
  };
}

