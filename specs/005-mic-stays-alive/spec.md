# 005 - The microphone stays alive

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

## What it reads and writes

Reads only the recognizer's own events and the existing mute, pause and
silence settings. Writes nothing to disk and sends nothing to the daemon.

## How to run, check, and hand over

Build with `npm run build`, which bundles `src/stts_ui.html` into `dist/`.

To check: open the voice window, leave it silent for three minutes, then
speak. The words appear and auto-send fires. In the console,
`lastMicEvent` should never be more than about 90 seconds behind
`Date.now()`.

Everything lives in the one always-on-microphone block near the end of
`src/stts_ui.html`.
