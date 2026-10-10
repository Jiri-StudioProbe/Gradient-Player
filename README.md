# Gradient Player

A touch instrument for phones and tablets. Slide a finger across a colour gradient to play, or switch
to an 88-key piano. Seven toggleable effects. No accounts, no data collected, no network calls.

**Live:** https://jiri-studioprobe.github.io/Gradient-Player/ (GitHub Pages — see *Deploy* below)

Primary target: iOS Safari (iPhone and iPad), also installable to the Home Screen. Android Chrome supported.

## Run locally

No build step — it is plain static files with ES modules.

```sh
npm run serve        # http://localhost:8080
npm test             # unit + regression tests (Node 20+, no dependencies)
```

## Layout

| Path | What |
|---|---|
| `index.html`, `css/app.css` | Page and styles |
| `js/pitch.js` | Pure pitch / scale / bend maths |
| `js/piano.js` | Pure piano layout, hit-testing, jitter and pan guards |
| `js/settings.js` | Settings, Guided/Free presets, persistence |
| `js/audio.js` | Web Audio engine: gradient + piano voices, effects rack, iOS audio quirks |
| `js/render.js` | Canvas drawing: gradient, note guide, piano |
| `js/main.js` | Input, settings UI, wiring |
| `manifest.webmanifest`, `sw.js`, `icons/` | Home Screen install + offline cache |
| `tests/` | `node --test` suites, including regression tests for the four prototype bugs |
| `tools/make-icons.py` | Regenerates the icons (Pillow) |
| `v2-parked/` | Original prototype + PRD; Play mode and songs wait here for v2 |

## Guided vs Free (evaluation switch)

Both are built so they can be compared on a real device. Use the **Guided / Free** pill (top left) or
*Play style* in settings. They differ only in whether pitch snaps to a scale:

- **Guided** — snaps to major pentatonic, always sounds good.
- **Free** — continuous glissando through every pitch.

Both default to a 2-octave range (C3–C5), vertical bend off, note guide on. The choice is remembered.
When you have picked one: delete the other from `PRESETS` in `js/settings.js` (and `styleOf`), then remove the
`style-switch` block and *Play style* row in `index.html`, and the matching code in `js/main.js`
(search for "EVALUATION SWITCH").

## Deploy

Pushing to `main` runs the tests and publishes `index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/` and
`icons/` to GitHub Pages (`.github/workflows/pages.yml`). One-time setup: repo **Settings → Pages → Source:
GitHub Actions**.

All paths are relative, so it works under the `/Gradient-Player/` sub-path. Bump `CACHE` in `sw.js` when the
list of shipped files changes.

## Add to Home Screen (iPhone / iPad)

Open the site in Safari → Share → **Add to Home Screen**. It then launches full screen and works offline.
