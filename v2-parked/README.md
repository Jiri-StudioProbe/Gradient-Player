# Parked for v2

v1 is the Explore instrument only. Everything for the "play along" / game features is parked here
and in git history, **not** shipped.

- `gradient-synth-prototype.html` — the original single-file prototype, including **Play mode**
  (circular tap targets, 1 s window, 3 lives, levels), the **six built-in songs** and the song
  token format (`NOTE`, `NOTE:beat`, `R`, `R:beat`).
- `Gradient_player_PRD.md` — the PRD this build started from (§3 Play mode, §4 song data,
  §5 retired Follow-along, §7 deferred features).

Things to settle before building v2 (found while reviewing the prototype):

- The PRD says a mis-tap and a timeout both cost a life; the prototype ignores mis-taps.
- The PRD mentions scoring; the prototype has none.
- Lives reset every level and Retry restarts the level, but the PRD says "three misses end the run".
- Only one target is on screen at a time, so no pitch knowledge is tested and the songs lose their rhythm.
- A backgrounded tab costs a life on return; the first 1 s window starts with no countdown.
- Tempo/`beat` values are vestigial in Play mode (flat 1 s window per note).
- Custom/user-authored songs: undecided.
- Recording/export/share (PRD §7): undecided. If wanted, the audio engine (`js/audio.js`) already takes
  its `AudioContext` constructor as a parameter, which is the first step towards offline rendering.
