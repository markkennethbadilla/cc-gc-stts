# 005 - The microphone stays alive, and stops hearing itself

## What it does

Keeps the voice window's microphone listening for as long as the window is
open, including after long stretches of silence, and brings it back if the
browser's speech recognizer stops without saying so.

## Why it exists

The window runs one always-on recognizer. Edge ends a recognition session
roughly every minute and the window starts a new one, so silence alone is
normally harmless. Two paths broke that:

1. A restart that threw was swallowed and never retried, so a single failed
   start left the microphone dead for the rest of the session.
2. A recognizer can wedge: no results, no `end` event, nothing to restart
   from. The window still said "Listening..." and auto-send never fired
   because no speech arrived.

Mark hit this on 2026-09-17: after a quiet stretch, speaking did nothing and
he had to type with Windows voice input instead.

## How it works

Every `start`, `result`, `soundstart` and `end` on the shared recognizer
stamps a "last event" time. A healthy microphone stamps at least once a
minute even in silence, because Edge's own session end restarts it.

A watchdog runs every 15 seconds. If the microphone is wanted, not muted,
not paused for the agent's own speech, and more than 90 seconds have passed
with no event, it clears any fatal flag, aborts the recognizer and starts it
again 300 milliseconds later.

The `end` handler now retries a failed start at 100, 200, 400 milliseconds
and so on up to 5 seconds, instead of giving up on the first throw.

The watchdog does nothing when "stop listening on silence" is switched on,
because stopping is what the user asked for there.

### The agent's own voice coming back

The Talk panel had no echo test at all. After the agent speaks with listening
switched on, the window is in Talk mode, so a transcript of the agent's own
voice arriving late went straight into the prompt box and was sent back as if
Mark had said it. It happened twice in a row on 2026-09-17.

The existing echo test only covers the Listen panel and only for 1.5 seconds
after speech ends, which is earlier than the late transcript arrives. So the
Talk panel gets a stricter, longer-lived test: text is dropped only when it
runs to at least four content words and at most a quarter of them are absent
from what was just spoken, within 20 seconds of the agent finishing or at any
time while it is still speaking. A short human reply, "yeah", "no, the other
one", is therefore never swallowed, and a real answer that happens to reuse
some of the agent's words is kept.

### Auto-send waits for him to stop talking

Auto-send counted from the last word the recognizer wrote down. Edge writes
words in bursts, so a thinking pause mid-sentence looked like the end of the
turn and the prompt was sent while Mark was still speaking, even with the
delay raised to four seconds.

The recognizer reports `speechstart` and `speechend`, which track sound, not
transcription. The send timer is now cleared on `speechstart` and only armed
on `speechend`, and `armPause` refuses to arm while speech is in progress. The
barge-in timer, which hands speech to the agent mid-turn, follows the same
rule.

## What it reads and writes

Reads only the recognizer's own events and the existing mute, pause and
silence settings. Writes nothing to disk and sends nothing to the daemon.

## How to run, check, and hand over

Build with `npm run build`, which bundles `src/stts_ui.html` into `dist/`.

`node --test test/echo.test.mjs` lifts the echo functions out of
`src/stts_ui.html` and checks them, so it fails if the page's version drifts.

To check: open the voice window, leave it silent for three minutes, then
speak. The words appear and auto-send fires. In the console,
`lastMicEvent` should never be more than about 90 seconds behind
`Date.now()`.

Everything lives in the one always-on-microphone block near the end of
`src/stts_ui.html`.
