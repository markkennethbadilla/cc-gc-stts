# 030 - Mute stays on until Mark turns it off

## What it does

When Mark pauses the microphone (Space or the pause button, spec 003/006), it
stays paused through every new listen the agent starts. While paused, a listen
waits and hears nothing. Only Mark's own unpause turns the microphone back on.

## Why it exists

Mark (2026-10-01): he pressed mute and it kept unmuting itself. Every new
`stt` listen, and every `tts` with `listen`, started the recognizer again
without asking whether he had paused it.

## How it works

- The page wraps the recognizer's `start()`. When the recognizer is the voice
  window's microphone and the window is paused, the wrapper records that the
  listen wants the microphone but does not start it.
- The watchdog restart (spec 011) keeps the pause instead of clearing it.
- Unpausing starts the microphone as before, so the waiting listen then hears.

## What it reads and writes

Only in-memory page state: `muted`, and the recognizer's `__wanted` and
`__paused` flags.

## How to run, check, and hand over

`node --test test/*.test.mjs` runs `test/mute-survives-listens.test.mjs`: pause, five
listens in a row stay silent, unpause starts the microphone, repeated three
times, plus 1000 paused listens. Live: `node build.mjs && node test/mute-persists.live.mjs` opens a real window on its own port, pauses, runs 5 listens and resumes. Rebuild with `npm run build`. The running
window picks the fix up when the page reloads (close and reopen the stts
window); the daemon does not need a restart.

Parity (rule 67): stts only. The callbot has no user-held mute (no mute in its code;
Meet mutes the bot on its own side), so there is nothing to carry over.
