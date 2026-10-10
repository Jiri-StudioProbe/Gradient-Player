import test from "node:test";
import assert from "node:assert/strict";
import {
  computeLayout,
  keyAt,
  panToCenterOnC4,
  panFromScrubX,
  clampPan,
  movedEnough,
  pinReleased,
  WHITE_KEY_W,
} from "../js/piano.js";
import { noteNameFromSemis } from "../js/pitch.js";

const layout = computeLayout();
const keyH = 600;
const W = 400;

test("layout is a real 88-key piano: 52 white, 36 black", () => {
  assert.equal(layout.whiteKeys.length, 52);
  assert.equal(layout.blackKeys.length, 36);
  assert.equal(layout.totalWidth, 52 * WHITE_KEY_W);
});

test("keyAt resolves white and black keys, null outside the keys", () => {
  assert.equal(noteNameFromSemis(keyAt(layout, 0, 5, 300, keyH)), "A0");
  // A#0 straddles the A0/B0 boundary at x=46, in the top 62% only
  assert.equal(noteNameFromSemis(keyAt(layout, 0, 46, 100, keyH)), "A#0");
  assert.equal(noteNameFromSemis(keyAt(layout, 0, 46, 500, keyH)), "A0");
  assert.equal(keyAt(layout, 0, 5, keyH + 1, keyH), null); // scrub strip
});

test("panToCenterOnC4 puts C4 under the middle of the screen", () => {
  const pan = panToCenterOnC4(layout, W);
  assert.equal(noteNameFromSemis(keyAt(layout, pan, W / 2, 500, keyH)), "C4");
});

test("pan is clamped to the keyboard", () => {
  assert.equal(clampPan(layout, -50, W), 0);
  assert.equal(clampPan(layout, 1e9, W), layout.totalWidth - W);
  assert.equal(panFromScrubX(layout, 0, W), 0);
  assert.equal(panFromScrubX(layout, W, W), layout.totalWidth - W);
});

test("Bug D setup: an unmoved finger resolves to a different key after the keyboard pans", () => {
  const pan1 = panToCenterOnC4(layout, W);
  const before = keyAt(layout, pan1, 200, 500, keyH);
  const after = keyAt(layout, pan1 + 5 * WHITE_KEY_W, 200, 500, keyH);
  assert.notEqual(before, after); // the phantom key change
});

test("Bug D guard 1: jitter under 3px is not treated as movement", () => {
  const last = { x: 200, y: 300 };
  assert.equal(movedEnough(last, 201, 301), false);
  assert.equal(movedEnough(last, 202, 300), false);
  assert.equal(movedEnough(last, 203, 300), true);
  assert.equal(movedEnough(null, 0, 0), true);
});

test("Bug D guard 2: after a pan, a pinned finger needs a real slide (one key width) before its note can change", () => {
  const pin = { x: 200, y: 300 };
  assert.equal(pinReleased(pin, 204, 302), false); // jitter
  assert.equal(pinReleased(pin, 200 + WHITE_KEY_W - 5, 300), false);
  assert.equal(pinReleased(pin, 200 + WHITE_KEY_W, 300), true);
  assert.equal(pinReleased(null, 0, 0), true);
});
