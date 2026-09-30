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

- One gate, `startMic`, is the only place the page turns a recognizer on. Every
  path goes through it: a new listen, the end of a spoken reply (a `tts`, with
  or without `listen`), both watchdogs, the retry after the recognizer ends,
  and unpausing. The gate refuses while Mark has paused, so no path can undo
  his pause.
- A listen while paused records that it wants the microphone but does not
  start it. The watchdog restart (spec 011) keeps the pause.
- A pause pressed while a reply is playing holds after the reply ends.
- Unpausing starts the microphone as before, so the waiting listen then hears.
- Every pause and resume is written to `daemon.log` ("paused by Mark",
  "resumed by Mark"), so a report of the mute clearing can be checked.

## What it reads and writes

In-memory page state: `muted`, and the recognizer's `__wanted`, `__paused` and
`__fatal` flags. Writes one `daemon.log` line per pause or resume.

## How to run, check, and hand over

`node --test test/*.test.mjs` runs `test/mute-survives-listens.test.mjs`: the raw
start is called in exactly one place; pause then five listens stay silent; pause
then five `tts` with `listen` (speech start, speech end, listen) stay silent;
pause during playback holds; unpaused speech end still resumes; 1000 paused
listens and replies start nothing. Live: `node build.mjs && node test/mute-persists.live.mjs` opens a real window on its own port, pauses, runs 5 listens, 5 spoken replies each followed by a listen, a pause pressed mid-reply, and resumes. Rebuild with `npm run build`. The running
window picks the fix up when the page reloads (close and reopen the stts
window); the daemon does not need a restart.

Parity (rule 67): stts only. The callbot has no user-held mute (no mute in its code;
Meet mutes the bot on its own side), so there is nothing to carry over.
