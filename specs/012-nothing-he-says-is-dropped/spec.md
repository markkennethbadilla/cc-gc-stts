# 012 - Nothing Mark says is dropped, however long he talks

## What it does

Mark can talk for as long as he wants, during a listen or while the agent is
busy with other tools, and every word reaches the agent, in order. A listen that
runs into the time limit of a tool call no longer fails. It returns
`__STTS_LISTEN_CONTINUES__`, the agent calls `stt` again at once, and that call
returns everything he said.

## Why it exists

On 2026-09-28 two things lost his speech:

1. A `tts` with `listen` and `idleSec` 200 failed with "no answer from the voice
   window within 240s; the request was dropped". He was talking at length, and
   all of it was lost; the next `stt` only got his later sentence.
2. He spoke at length while the agent was running other tools, and only "Thank
   you." arrived through the barge-in hook.

Root causes, found in the code:

- `daemon-client.ts` and `stts-daemon.ts` both bounded every request at 240
  seconds and **failed** it at the bound (spec 007). The `tts` and its listen were
  two requests of 240 seconds each inside **one** tool call, so the pair could
  run past the gateway's 300 seconds, and a listen cut at the bound was an error.
- When the daemon released the listen, the page was not told. It kept his words
  in the box and sent them after his pause as `complete`. The daemon had nothing
  pending and threw them away (`resolvePending` returns when nothing is pending).
  If the next `stt` came first, the page cleared the box for it instead.
- Between tool calls, Edge often holds a long utterance as unfinished (interim)
  text. Only finished (final) text was kept. When the agent then spoke, the page
  muted the microphone with an abort, and an abort throws interim audio away. So
  only the last short sentence, "Thank you.", which Edge had finished, survived.
- The watchdog that restarts a dead microphone (spec 011) only ran during a
  listen, so a microphone that died while the agent worked stayed dead.

## How it works

- **One budget per tool call.** The MCP server gives the whole call 240 seconds
  (`STTS_REQUEST_TIMEOUT_MS`) and passes what is left to each request as
  `timeoutMs`. The daemon answers at that bound; the client waits five seconds
  longer, so the daemon's answer wins and the call returns before the gateway
  gives up.
- **A listen at the bound continues.** The daemon answers
  `__STTS_LISTEN_CONTINUES__` and sends the page `released`. The page moves the
  box and any unfinished text into its carry, the same store it uses for speech
  heard while idle. The next listen starts with the carry in the box. If no listen
  comes, the carry goes to the daemon as a barge-in after his pause.
- **Late speech is kept.** A `complete` that arrives with no listen pending goes
  into the barge-in buffer instead of being dropped. The next listen returns it
  first, and a listen that would answer "no speech" answers with the buffer
  instead.
- **Unfinished speech is saved before anything can discard it.** While idle, the
  page remembers the latest interim text and moves it into carry on every
  recognizer end, before every abort (the mute when the agent speaks, a restart),
  and when a listen starts. A final that lands later is deduped against it.
- **The microphone watchdog runs while idle too**, not only during a listen, so
  speech between tool calls is heard. It still stays out of the agent's own turn.
- **A connected window is reused.** After a daemon restart the old window
  reconnects on its own, and the daemon no longer opens a second one.

Known limit: if Edge finalises an utterance more than four seconds after its
interim text was saved, the overlap can appear twice. A repeated phrase is
preferred to a lost one.

## What it reads and writes

- Reads `STTS_REQUEST_TIMEOUT_MS` (optional, default 240000) and `STTS_PORT`
  (optional, tests only; the client and the daemon both honour it).
- Writes nothing new to disk. The barge-in buffer is the daemon's memory, as
  before.

## How to run, check, and hand over

```
npm run build
node --test test/*.test.mjs
```

`test/long-speech-and-read.test.mjs` runs the real daemon and the real MCP server
on a private port with a stand-in window: a listen at the bound continues and the
window is told; late speech comes back first and in order; a silent listen
answers the buffered speech; 2000 utterances arrive in order; a long `tts` plus
its listen returns inside the budget. `test/page-keeps-speech.test.mjs` lifts the
page code and checks the carry. The window itself needs a person talking, so the
page is checked live by Mark after the window is reopened.

Hand over: this spec, `src/stts-daemon.ts`, `src/daemon-client.ts`,
`src/stts-mcp-server.ts`, `src/stts_ui.html` (the fork script block), and the two
tests.

## Live finding after the first release (2026-09-28)

The first release still lost speech between tool calls. Read over the window's
DevTools port: one second after a prompt was sent, `isRecording` was `false`.
Upstream `submit` and `cancel` stop dictation, and the fork had not suppressed
them the way it suppresses `resetToIdle`, so the mic was off for as long as the
agent worked. A second fault hid behind it: `resetToIdle` cancels speech on every
turn change, and that cancel was stamped as "speech just ended", so in speakers
mode the echo filter threw away anything said within 1.5 seconds of it.

Both are fixed: sending or cancelling never stops the mic, and only a cancel that
cut real speech counts as the end of speech. Proved in a private headless Edge
with a stand-in recognizer, served by a daemon on a test port: with the previous
build the mic was off after a send and the next listen came back empty; with this
one the mic stayed on and the next listen held everything said between calls
(three runs). The already-open window keeps the old page until it is closed and
reopened.
