Oct 10, 2026 · @Jiri Jerabek

## 1. Overview

Gradient Synth is a single-file, browser-based musical toy built for mobile touchscreens (no build step, no external assets — one self-contained HTML file). It started as a simple idea — *screen position as pitch* — and grew through iteration into a two-mode app:

- **Explore mode** — a sandbox instrument. Two interchangeable surfaces (a full-screen color gradient, and a proper 88-key piano), full scale and color-mapping options, a vertical pitch-bend dimension, and a 7-effect chainable audio rack. The point is open-ended play and sound design, not scoring.
- **Play mode** — a tap-accuracy *game*. Circular targets are positioned by pitch on X and randomized on Y, must be hit within a forgiving 1-second window, and are played through the same piano timbre. Three misses end the run; clearing a level's song advances to the next.
- Play mode is descoped from v1 build - it is in the prototype, but do not build for v1 of the real build

### Why the split

The project began as one gradient/piano instrument with an optional "follow the highlighted note" guided-play feature layered on top (nicknamed **Song mode**). Porting that guided-play feature from the piano onto the free-form gradient surface exposed a real tension: the gradient's touch zones aren't neatly ordered like piano keys, especially once vertical pitch-bend is active, and tying a *game* to exact pitch-accurate dwell-timing fought against the surface's role as an *instrument*.

The resolution was to stop treating guided-play as a mode bolted onto Explore, and instead split the product in two along what each half is *for*:

- Explore optimizes for **ease of playing** — it should always sound good, with Y free for expressive pitch bend.
- Play optimizes for **playability as a game** — target Y position is randomized for challenge, scoring and lives give it stakes, and it deliberately drops the pitch-bend axis since it isn't needed for tap accuracy.

As part of this pivot, the original Follow-along/Song-mode feature (the piano-only guided-play prototype, including its later gradient port) was fully retired rather than kept alongside the new Play mode — see §5. The underlying song data (six built-in nursery-rhyme-length songs) was kept and reused as Play mode's levels (§4).

### Status

Both modes are built and working, including a full pass of bug-fixing on the audio/input layer (§6). Recording/saving/sharing performances from Explore mode, and any form of ringtone/alarm export, are discussed but explicitly out of scope for now (§7).

## 2. Explore Mode

### Two surfaces, one engine

**Gradient surface.** A full-screen color field where X maps to pitch and touch/drag plays and glides continuously (glissando). Pitch is mapped linearly in semitones (i.e. logarithmically in frequency) across the screen, using Scientific Pitch Notation internally (C0 = 16.3516 Hz as the universal reference; octave numbers increment at C, so C4 is middle C). The default range is centered on C4.

**Piano surface.** A proper concert-range 88-key keyboard, A0–C8, laid out as a horizontally scrollable mirror of a real piano (white/black keys, a scrub bar to pan). It has its own dedicated synthesis voice: two slightly detuned oscillators, a hammer-strike attack envelope, natural self-decay, and a filter-brightness envelope — built to sound like a plucked/struck piano note rather than a sustained synth tone. This same piano voice is reused by Play mode (§3).

Both surfaces share the same pitch/scale engine and effects rack; switching between them is a settings toggle, not a different instrument.

### Scales and color mapping (optional, off by default)

By default the gradient plays the full chromatic range continuously. As opt-in settings:

- **Scales**: major, minor, major pentatonic, minor pentatonic, or chromatic — constrains playable pitches to a scale so the gradient is harder to play "wrong."
- **Color mapping**: two interchangeable modes — a **hue sweep** (color changes once across the whole pitch range) and a **chroma circle** (color repeats every octave, so the same pitch class always looks the same color regardless of octave). Both were kept as switchable options rather than picking one, so the two could be compared directly.

A toggleable **note-guide overlay** draws a border and note-name label over each note's touch zone. Zone *borders* sit at the true midpoint between neighboring in-range notes; each label is drawn at that note's own exact pitch position (not the zone's midpoint) — an earlier version conflated the two, which made the overlay look miscentered even when the underlying math was correct (see §6, Bug A).

### Vertical pitch bend

The gradient's Y-axis carries a second, independent dimension of expressive control: continuous pitch bend, layered on top of the X-derived note rather than replacing it. This was chosen over two alternatives considered (discrete octave bands on Y, or a non-pitched effect on Y) because the goal was expressiveness, not extending range, and it was the simpler of the two expressiveness-focused options to implement. The gradient's pre-existing Y-driven brightness/filter effect was explicitly kept unchanged alongside it.

### Effects rack

Seven effects, each an independent on/off switch so they can be layered together: **distortion, vibrato, chorus, phaser, tremolo, delay, reverb**. Each is built as a dry/wet insert (parallel dry and wet signal paths summed together), so switches can be toggled live without clicks. Several of these (vibrato/chorus/phaser) are built from the same underlying primitive — a short modulated delay line — differing only in depth, rate, and mix.

## 3. Play Mode (the game)

Play mode turns the instrument into a tap-accuracy game. Levels are songs (see §4); the player's job is to tap the right note, in order, as it appears.

### Targets

Each note in the level appears as a **circular tap target**, colored by pitch class, labeled with its note name. Horizontal position is a deterministic function of pitch (clamped to 8–92% of screen width); vertical position is **randomized** per target. This was an explicit design trade-off: giving up the neat left-to-right ordering of a keyboard increases *playability* as a game, since the player can no longer rely on spatial muscle memory and has to actually read each target. Pitch bend (Explore's Y-axis feature) is not used here — Y is free for randomization instead.

Hitting a target plays it through the same piano voice used on the piano surface in Explore mode (struck-string envelope, self-decaying — no explicit note-off needed).

### Timing and failure

Each target gives the player a **1-second window** to hit it — a deliberately generous, round number chosen for feel rather than derived from the song's actual tempo. Missing the window counts as a failed attempt and the game advances to the next target regardless. **Three failed attempts end the run** (Game Over); there is no separate penalty or different handling for an active miss (mis-tap) versus a timeout — both consume one of the three lives the same way.

### Levels and HUD

Levels are the shared song library (§4), stepped through in a fixed order. Clearing a level's full note sequence shows a Level Complete screen and advances to the next; clearing the final level shows a Victory screen. The on-screen HUD shows remaining lives (as dots) and the current level's name; a depleting ring drawn around the active target visualizes the countdown to the 1-second timeout.

### Scope note

Play mode intentionally does not attempt to support every Explore scale type. Scales with few notes (e.g. pentatonic) can't represent arbitrary songs; the chromatic scale can play anything, so levels are authored assuming full chromatic coverage rather than trying to make every scale option playable as a level.

## 4. Shared song data model

Songs are shared data, used as Play mode's levels and originally built for the now-retired Follow-along feature (§5). Six built-in songs: **Hot Cross Buns, Mary Had a Little Lamb, Jingle Bells, Twinkle Twinkle Little Star, Ode to Joy, Frere Jacques.**

Each song is a string of whitespace-separated tokens:

- `NOTE` — a note name (e.g. `C4`), played for a default duration
- `NOTE:beat` — a note name with an explicit duration in beats
- `R` / `R:beat` — a rest, with or without an explicit duration

This duration/rest syntax was added specifically for the earlier Follow-along feature, where real timing (including rests) needed to be felt by the player following along. In Play mode, this is now **vestigial**: Play mode strips rests and ignores beat values entirely, since every target gets the same flat 1-second window regardless of the song's original rhythm. The token format was kept rather than introducing a second song format, since the underlying note sequence is identical either way — only the timing interpretation differs between the old feature and the new one.

## 5. Retired feature: Follow-along (Song mode)

Before the Explore/Play split, guided play lived inside Explore mode itself, as a "Follow-along" feature:

- On the **piano**, the next note to play glowed. A growing fill-meter ("measuring cylinder") overlay on the pressed key visualized how long to hold the note, matching the song's real note durations, including felt pauses for rests.
- The highlight was tuned to flash off-then-on after *every* correct hit, including repeats of the same key — otherwise a repeated note left the key continuously lit with no cue that it needed to be struck again.
- This was then **ported to the gradient surface**, highlighting touch-area zones instead of keys, with the same advance-on-correct-note logic. Porting surfaced a real fit problem: gradient touch zones aren't ordered left-to-right by scale degree the way piano keys are, especially with vertical pitch bend active, and not every scale could represent every song (pentatonic scales, for instance, fail most of the 6 built-in songs; chromatic can play all of them).

### Why it was retired

Once Play mode was designed as a dedicated, scored, timed game using the same songs, keeping Follow-along running in parallel inside Explore would have meant two overlapping implementations of "guided play through a song" with different rules (real-time dwell-and-rest-accurate vs. flat 1-second-window-and-lives). Follow-along was removed in full — UI (practice panel, song picker, progress indicator), styling (duration-ring), and all supporting state and functions (`loadSongNotes`, `revealCurrentStep`, `advanceSongIfMatch`, the hold-meter renderer, zone-highlight drawing, and related helpers) — and verified removed by grepping the shipped file for stale references and re-running a syntax check. Play mode is now the only guided/song-following experience in the app.

## 6. Key bugs found and fixed

Four issues surfaced during development, three of them across a single multi-round bug report that kept getting more specific. The verification approach used throughout: extract the actual shipped `<script>` content from the HTML file (via line-range slicing), syntax-check it, and exercise the real functions in Node.js against hand-built minimal stubs (fake `AudioContext`, canvas context, DOM, clock) — never a reimplemented stand-in, since that had once produced a misleadingly clean test result.

### Bug A — note-guide labels and octave offset

**Symptom:** a screenshot showed the overlay labeled C6–C8 for what should have been a C3–C5 range. **Root cause (two compounding issues):** (1) overlay labels were drawn at the midpoint toward the *next* note rather than each note's own exact position, making the overlay look off-center even when correct; (2) `noteNameFromSemis` carried a leftover `+3` octave offset from an earlier design assumption, shifting every displayed name three octaves too high. **Fix:** removed the `+3` offset; labels now draw at each note's own position while zone *borders* are computed separately as true midpoints between neighbors. Verified in Node against the reported scenario: confirmed C3–C5 and screen-center resolving to exactly C4.

### Bug B — piano envelope click ("short drum / crack")

**Reported:** "it sounds as if there was 'empty short drum' or a 'crack' and the tone was cut short after a millisecond... no observable pattern." **Root cause:** the decay stage (`setTargetAtTime`) was scheduled to start at the same instant (`now`) as the still-in-progress attack ramp (`linearRampToValueAtTime`, ending at `now + 0.008`). Two Web Audio automation events with overlapping active windows on the same parameter produce undefined, glitchy behavior. **Fix:** start the decay stage at `now + 0.008`, i.e. exactly when the attack ramp actually finishes. Verified via an envelope-curve simulation showing a clean 0 → 0.85 → decay curve. **Outcome:** a real, worthwhile fix — but the user reported the problem persisted, newly noting it began after the key-blinking feature was added.

### Bug C — same-note retrigger overlap

**Reported:** problem persisted after Bug B's fix, tied to the key-blinking feature. **Root cause:** voices were keyed only by pointer ID. Releasing a key removed it from the active-voices map but didn't stop its oscillators, which kept fading for up to 0.6s. Striking the *same* note again quickly — exactly what the blink cue was designed to prompt for repeated notes — started a second, independent oscillator pair at the identical pitch, overlapping the still-fading first pair; two near-identical waveforms at a near-random phase relationship produced an audible click. **Fix:** added a by-pitch voice registry; starting a note now force-cuts (fast \~15ms fade, \~40ms stop) any already-ringing voice for that exact pitch before starting a new one, with cleanup that only clears the registry entry if it's still the current voice for that note (so a late cleanup can't clobber a newer voice). Verified with a Node mock exercising the real start/stop functions through a same-key-twice-quickly scenario. **Outcome:** also a real fix — but the user reported a much more specific, still-present symptom: notes appearing to be "fast-forwarded or skipped," as if some were randomly dropped.

### Bug D — the actual root cause: panning under a held finger

**Reported (most specific):** "as if note note \[nothing\] note note... as if some notes were fast forwarded or skipped." **Root cause:** Follow-along's auto-scroll (centering the keyboard on the next target note) could re-pan the keyboard *while a finger was still down*. Because which key is "under" a given x-coordinate depends on the current pan offset, panning while a finger sat still silently changed which note that finger was touching — and the very next `pointermove` event (even from ordinary touchscreen jitter, sub-pixel movement with no real intent) read a "different key," triggering an unwanted stop/restart of the just-struck note and an unintended advance to a note the player never actually played. Proven directly in a Node simulation: a touch held at a fixed x=200 resolved to C4, then after an auto-scroll pan, that *same, unmoved* x=200 resolved to G4 — a literal phantom key change. **Fix (two parts):** (1) auto-scroll now only pans immediately if no finger is currently touching the keyboard; otherwise the target pan is queued and applied only once the *last* finger lifts; (2) a movement-distance guard (≥3px) was added to the piano's pointermove handling so that jitter alone can never be read as a deliberate slide to a new key — a general-purpose protection against this whole class of bug. Verified with Node simulations covering: pan held steady while a finger is down, the deferred pan applying correctly on release, and correctly waiting for the *last* of several simultaneous fingers. **Outcome:** confirmed fixed by the user ("problem finally fixed"). Notably, this bug was an input/pan-coordination issue, not an audio-synthesis issue — Bugs B and C were real and worth keeping, but neither was the cause of what the user was actually hearing.

## 7. Deferred / out of scope

Discussed at a design level but not built:

- **Recording a performance in Explore mode.** Proposed approach: log a timestamped event sequence during play (note on/off, pitch bend, effect toggles), then re-render it afterward through an `OfflineAudioContext` to produce a downloadable audio file — rather than live-capturing with `MediaRecorder`, for more reliable cross-device results.
- **Saving / sharing the result socially.** Proposed approach: the Web Share API's file-sharing capability (`navigator.share({ files: [...] })`) once a rendered file exists.
- **Using a recording as a phone ringtone or alarm sound.** This is **not achievable directly from a website** on either iOS or Android — no public web API exposes installing a system ringtone or alarm. The realistic path is exporting a good audio file from the app and having the user finish the job manually (e.g. via GarageBand's "export as ringtone" flow on iOS, or an Android equivalent).

## 8. Open questions and next steps

Flagged as needing real on-device confirmation rather than further development work:

- Does the 1-second timing window in Play mode actually feel forgiving once target Y position is genuinely random (as opposed to how it felt during desk-testing)?
- Is the pitch-class color coding on game targets legible against the dark Play-mode background?
- Is the \~46px target radius comfortable for real-thumb accuracy on an actual phone screen?

Open for a future decision, not yet committed to either way:

- Whether to proceed with Explore-mode recording/export/sharing (§7) now, or treat it as a later phase.
- Whether Play mode should ever support custom/user-authored songs — the retired Follow-along feature did support a custom song entry; Play mode currently does not.
