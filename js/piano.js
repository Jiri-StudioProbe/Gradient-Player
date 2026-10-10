// Pure piano layout, hit-testing and pointer helpers.
import { PIANO_RANGE, CENTER_ABS_SEMI, clamp } from "./pitch.js";

export const WHITE_KEY_W = 46;
export const BLACK_KEY_W = 28;
export const SCRUB_H = 28; // navigation strip height (sits above the bottom safe-area inset)
export const BLACK_FRACTION = 0.62; // black keys cover the top 62% of key height

const WHITE_PC = new Set([0, 2, 4, 5, 7, 9, 11]);
const BLACK_PC = new Set([1, 3, 6, 8, 10]);

export function computeLayout() {
  const { startAbs, totalSemis } = PIANO_RANGE;
  const whiteKeys = [];
  const blackKeys = [];
  let whiteCount = 0;
  for (let abs = startAbs; abs <= startAbs + totalSemis; abs++) {
    const pc = ((abs % 12) + 12) % 12;
    if (WHITE_PC.has(pc)) {
      whiteKeys.push({ abs, x: whiteCount * WHITE_KEY_W });
      whiteCount++;
    } else if (BLACK_PC.has(pc)) {
      blackKeys.push({ abs, x: whiteCount * WHITE_KEY_W - BLACK_KEY_W / 2 });
    }
  }
  return { whiteKeys, blackKeys, totalWidth: whiteCount * WHITE_KEY_W };
}

export function clampPan(layout, pan, viewW) {
  return clamp(pan, 0, Math.max(0, layout.totalWidth - viewW));
}

export function keyCenterX(layout, abs) {
  const w = layout.whiteKeys.find((k) => k.abs === abs);
  if (w) return w.x + WHITE_KEY_W / 2;
  const b = layout.blackKeys.find((k) => k.abs === abs);
  return b ? b.x + BLACK_KEY_W / 2 : null;
}

export function panToCenterOn(layout, abs, viewW) {
  const x = keyCenterX(layout, abs);
  return x === null ? 0 : clampPan(layout, x - viewW / 2, viewW);
}

export function panToCenterOnC4(layout, viewW) {
  return panToCenterOn(layout, CENTER_ABS_SEMI, viewW);
}

// Which key is under screen point (x, y)? keyH is the height of the keys (excludes the scrub strip).
export function keyAt(layout, pan, x, y, keyH) {
  if (y < 0 || y >= keyH) return null;
  const realX = x + pan;
  if (y < keyH * BLACK_FRACTION) {
    for (const bk of layout.blackKeys) {
      if (realX >= bk.x && realX <= bk.x + BLACK_KEY_W) return bk.abs;
    }
  }
  for (const wk of layout.whiteKeys) {
    if (realX >= wk.x && realX <= wk.x + WHITE_KEY_W) return wk.abs;
  }
  return null;
}

export function panFromScrubX(layout, x, viewW) {
  const target = clamp(x / viewW, 0, 1) * layout.totalWidth;
  return clampPan(layout, target - viewW / 2, viewW);
}

// Touchscreen contacts jitter a pixel or two even when held still. Only treat a move as a
// deliberate slide once it has travelled at least `min` px from the last accepted position.
export function movedEnough(last, x, y, min = 3) {
  if (!last) return true;
  const dx = x - last.x;
  const dy = y - last.y;
  return dx * dx + dy * dy >= min * min;
}

// When the keyboard pans while a finger is held on a key, the key under that (unmoved) finger
// silently changes. A "pin" freezes the finger's note until it travels a real distance, so a pan
// by a second finger can never be misread as a slide to a different key.
export function pinReleased(pin, x, y, release = WHITE_KEY_W) {
  if (!pin) return true;
  const dx = x - pin.x;
  const dy = y - pin.y;
  return dx * dx + dy * dy >= release * release;
}
