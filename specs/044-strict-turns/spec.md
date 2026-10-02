# 044 - Strict turns: listen, answer that turn, listen

## What it does

The voice loop is a strict back and forth. Every time the agent hears Mark, it
gets one numbered turn, answers that turn at once, and only then listens again.
Nothing he said earlier turns up later, and nothing is delivered twice.

- Every returned transcript starts with `[turn N, heard HH:MM:SS to HH:MM:SS]`
  (local time): a number that only goes up, and when he started and stopped
  saying it.
- A listen returns at most one turn: the one he just said.
- The same words delivered again (a late or repeated final) are never
  returned. Speech captured before the end of the last returned turn is
  dropped as stale. The same words said again later (a second "yes") are a
  new turn.
- A sentence cut mid-thought ("can you check the") is not returned. The
  daemon listens up to 3 more seconds and joins what follows into the same
  turn, at most 3 times, then returns what it has. The agent never has to ask
  for the rest.
- After a turn is returned, a plain `stt` is refused with "turn N is
  unanswered. Answer it now with tts (listen=true), or, if it needs no spoken
  answer, call stt with ack=N." Any `tts` answers the turn. `stt` with `ack=N`
  is the way to stay silent on purpose. A no-speech, time-limit or background
  result return is not a turn and needs no answer.
- The window and speakers mark each state (spec 045: banner and earcons).
  Words said while it is not listening are dropped (spec 042), and the window
  says so.

## Why it exists

Mark, 2026-10-03: "comms literally becomes asynchronous. I say something, it
gets worked on 2 responses later while my expectation is it's being worked on
right now." Seen that day: the same transcript delivered twice, once late, so
the agent answered old speech; speech captured during tool work returned a
turn later; a listen returned a fragment, the agent asked for the rest, and
the full sentence arrived a turn later.

## How it works

- `src/stts-daemon.ts` keeps `turnId`, `unanswered`, `lastNorm`, `lastEndAt`
  and `held`. On a `complete` from the page during a listen it drops a
  duplicate (same normalised words, starting within 1 s of the last turn's
  end) or stale speech (ending before the last turn ended) and re-opens the
  page's listen; holds a turn whose last word reads unfinished
  (`readsUnfinished` in `src/protocol.ts`) and re-opens the listen with
  `idleSec` `STTS_JOIN_SEC` (default 3); otherwise answers with the
  numbered turn. A no-speech, time-limit or background-result end returns
  a held turn instead of the marker.
- `POST /request` parses the body first. A `tts` clears `unanswered`; an
  `stt` whose `ack` is not the unanswered id gets `409` with the message above,
  before it can supersede anything.
- The page (`src/stts_ui.html`) sends `startAt` (first words of the turn) and
  `endAt` with each `complete`, and sets the three status lines.
- `src/stts-mcp-server.ts`: `stt` takes `ack`; `TURN_NOTE` in both tool
  descriptions states the protocol. The `/stts` command (`commands/`) and the
  plugin skill (`skills/stts/SKILL.md`) say the same.

### Parity with the call bot (its spec 014)

| Behaviour | stts | callbot | Why |
| --- | --- | --- | --- |
| Turn id and capture times | `[turn N, heard ... to ...]`, local time | The same, `UTC` | Channel: the call bot runs on the VPS in UTC |
| Several turns waiting | Cannot happen: speech outside a listen is dropped (spec 042) | All returned in order, older ones marked `[stale turn N]`, newest is the one to answer | Channel: a meeting cannot drop other people's speech |
| Unanswered turn refuses the next listen | `409`, `ack=N` to skip | The same (`409`, `ack`) | Same |
| Cut sentence joined | Daemon re-listens 3 s, up to 3 joins | Server waits 3 s more of quiet when the last line reads unfinished, inside the 20 s hold cap | Same outcome; the call bot holds lines itself, stts has to re-open the page's listen |
| Duplicate | Same words starting within 1 s of the last turn's end | Same words within 1 s of the last turn | Same |

## What it reads and writes

In memory in the daemon only. Reads `STTS_JOIN_SEC` (test override). Logs
`turn dropped (duplicate or stale)` to `daemon.log`.

## How to run, check, and hand over

`npm run build`, then `node --test test/*.test.mjs`. `test/turns.test.mjs`
covers rising ids, the refused unacked listen and `ack`, duplicate and stale
drops, a repeated "yes" said later, the fragment join, a fragment with no
continuation, and that no-speech is not a turn.
