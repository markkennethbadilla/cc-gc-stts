# 010 - A listen that hears nothing hands the turn back

## What it does

When the voice window is listening and Mark says nothing for a while (200 seconds
by default since spec 017), the listen ends on its own and the agent receives the marker
`__STTS_NO_SPEECH__`. The window stays open and the microphone stays on. The
agent then either tells him a result that has come in, or quietly listens again.

## Why it exists

A listen used to wait until Mark spoke, or until the 240-second request limit
(spec 007). While it waited, the agent could do nothing else. So when the agent
said "I'll tell you when the background work lands", both sides waited on each
other: the agent could not speak until he did, and he was waiting for the agent.
On 2026-09-28 that was 181 seconds of silence, and it looked like a freeze.

## How it works

- **The tools** (`stts-mcp-server.ts`) take an optional `idleSec`: on `stt`, and
  on `tts` when `listen` is true. It defaults to 200 (`DEFAULT_IDLE_SEC` in
  `src/protocol.ts`, spec 017); agents always use that default, because a background
  result interrupts the listen on its own. `0` waits for him, as before. Both tool descriptions say
  what the marker means, so every agent reads it every session.
- **The page** (`stts_ui.html`, `armIdle`) starts a timer when a listen begins.
  When it fires, if nothing is typed or heard, it sends `{ type: 'nospeech' }` and
  goes back to idle: nothing is spoken and the window does not close. If he is
  mid-word at that moment it waits a second and checks again, so he is never cut
  off. A new listen or a finished turn replaces the timer.
- **The daemon** (`stts-daemon.ts`) answers `nospeech` by resolving the waiting
  listen with `NO_SPEECH`. Only a listen can end this way.
- **After it fires**, the microphone is still live. Anything he says while the
  agent is busy reaches it as a barge-in (spec 002), or is added to the next
  listen.
- **The `/stts` prompt** (`commands/stts.md`, `commands/stts.toml`,
  `skills/stts/SKILL.md`) now tells four replies apart: the end marker (stop,
  silently), the no-speech marker (relay a finished result, or listen again
  silently; never the end), empty (cancelled: say Done and close), and anything
  else (his prompt).

## What it reads and writes

- Reads the `idleSec` tool argument. Writes nothing.

## How to run, check, and hand over

```
npm run build
node --test test/*.test.mjs
```

`test/no-speech-idle.test.mjs` lifts `armIdle` out of the real page and checks:
silence sends `nospeech` once and goes idle; typed text or partial speech stops
it; speaking at the deadline delays it without cutting him off; `0` or no value
waits as before; a turn that already ended sends nothing. It also checks the
daemon branch, the marker's shape, and that both tools pass `idleSec`.

Live check, for Mark: start `/stts`, say nothing for 200 seconds. The agent should
get its turn back, then listen again without speaking. Speak after that and the
next listen hears it.

Hand over: this spec, `src/protocol.ts`, `src/stts_ui.html`, `src/stts-daemon.ts`,
`src/stts-mcp-server.ts`, `src/daemon-client.ts`, the command and skill files,
`test/no-speech-idle.test.mjs`.
