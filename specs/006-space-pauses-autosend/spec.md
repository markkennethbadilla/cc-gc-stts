# 006 - Space (or the Pause button) pauses the auto-send countdown; it never submits early

## What it does

- Pressing **Space** anywhere in the window, except while actually
  typing into a text field, toggles pause: one press pauses, like a
  play/pause button, the next press resumes. It is not hold-to-pause —
  there is no keyup handler, a tap is enough.
- A visible **Pause** button sits next to the mic button in the Talk
  panel, doing the exact same toggle as Space. It reads "Pause" while
  listening and "Resume" while paused, so there is one state with two
  ways to hit it, not two separate mechanisms. What used to be called
  "mute" (spec 003) is this same state, relabelled — Mark: "if we've
  already specced out that the space is also mute at the same time,
  essentially the same thing right? Instead of mute, maybe it should
  just be pause."
- While paused, the auto-send countdown that decides "Mark has stopped
  talking, send it" is held: any timer already armed is cancelled the
  instant he pauses and nothing new arms until he resumes. Nothing in
  the prompt box is submitted while paused, however long he holds it.
- The status line shows "(paused, Space to resume)" while paused — the
  visible pause indicator.
- Space typed while a text field (the prompt box, the response box, the
  auto-send-seconds number field) is focused just types a space. It no
  longer also toggles pause.

## Why

Mark (2026-09-17): "if I mute or if I press the spacebar, it should
pause... it should not process the text. It should just pause right
there because I might want to think for a moment before I speak more."
And, correcting the first draft of this spec: "the space bar should be
one press, not hold... It is like play, pause, play, pause," and the
mute control and the pause should be "essentially the same thing," not
two mechanisms.

Before this spec, pressing Space stopped the microphone (spec 003's
"mute") but left any auto-send countdown that was already armed
(`pauseTimer`, `bargeTimer`) running. If Mark paused mid-thought after a
few words, the timer that started on his last word before the pause
still fired and sent the half-formed prompt out from under him. There
was also no on-screen button for the same control, only the key.

## How it works

- `src/stts_ui.html`, the fork's second `<script>` block:
  - `armPause()` and `armBarge()` now check the `muted` flag first and
    refuse to arm a new timer while paused.
  - `setMuted(on)` clears any timer already armed (`pauseTimer`,
    `bargeTimer`) the moment `on` is true, on top of its existing mic
    abort. Nothing new arms until Mark resumes and speaks again —
    Chrome's `speechstart`/`speechend` events drive the next
    `armPause()` call normally once the mic restarts.
  - The `keydown` listener for Space skips entirely when
    `e.target.closest('input, textarea, select, [contenteditable]')`
    is truthy, so a space typed into any field is just a space. It was
    already a single toggle (`setMuted(!muted)`) with a `repeat` guard,
    so no hold-vs-tap change was needed there.
  - A new `#pause-btn` button is inserted into the Talk panel's
    status area, next to `dictateBtn`. Its click calls the same
    `setMuted(!muted)` toggle Space uses, and `setMuted` updates its
    label/class alongside the existing status-line and dictate-button
    styling.
  - The CSS text that used to say "(muted, Space to unmute)" now says
    "(paused, Space to resume)", and `#pause-btn` gets a `.paused`
    class for its own label swap.

## What it reads and writes

Reads/writes only in-memory page state (`muted`, `pauseTimer`,
`bargeTimer`) and the DOM it already touched. No new storage key, no
new network call.

## How to run, check, hand over

- Build: `npm run build` in the repo root (esbuild via `build.mjs`,
  see `package.json`).
- Manual check (no test harness for the browser UI in this repo):
  1. Open the STT window, start dictating a few words, press Space
     mid-sentence. The status line shows "(paused, Space to resume)",
     the Pause button now reads "Resume", and the prompt box keeps
     whatever was already transcribed, unsent.
  2. Wait past the configured auto-send seconds while still paused —
     nothing is sent.
  3. Press Space again (or click Resume) to resume, speak again, stop —
     auto-send fires normally after the configured silence.
  4. Click into the prompt box and type a sentence containing spaces —
     none of those keystrokes toggle pause.
  5. Click the Pause button instead of using Space — same effect,
     same label swap.
  6. Pause with nothing said yet — no crash, nothing to send, button
     still toggles.
  7. Pause and hold it for several minutes (past the 90s watchdog
     interval) — the watchdog already skips restart while `muted` is
     true (line ~1873), so the mic stays off and the countdown stays
     cleared the whole time.
  8. Rapidly toggle pause on/off several times in a row — mic and
     timers settle to the last toggle's state, nothing throws, no
     stray auto-send fires from a timer that should have been
     cancelled.
- No automated test exists for this file (it is a static page served by
  the daemon, no test runner wired to it in `package.json`). This spec
  and the manual steps above are the check; a future spec that adds a
  headless-browser test harness for `stts_ui.html` can absorb these
  steps.
