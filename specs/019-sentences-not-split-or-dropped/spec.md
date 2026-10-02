# 019 - Sentences are not split at a thinking pause, and nothing is lost to a restart

## What it does

- The voice window sends what Mark said after 0.7 seconds of silence, so a
  finished turn reaches the agent fast. When what he said so far reads
  unfinished (its last word is "and", "so", "but", "because", "um", "the",
  "to", a lead-in like "so I was thinking"), the window waits the longer hold,
  1 second, before sending. Both are settings in the window.
- A turn that still reads unfinished after the hold is joined with what follows
  by the daemon before it is returned (spec 044).
- When the speech recognizer stops (Edge ends it with a `network` error about
  once a minute), it starts again at once instead of waiting up to 5 seconds
  with the microphone deaf.
- Words Mark says while the agent is speaking are kept for his next message,
  The agent's own voice never reaches the recognizer (spec 037).

## Why it exists

Mark (2026-09-30): his speech arrived in pieces and parts of it were missing.
Three causes, all in the page:

1. Auto-send fired after 2 s of silence, so a thinking pause split a sentence
   into two messages, each answered. A longer timer (3.5 s) made every turn
   slow to send, so Mark moved to a 1 s timer with the completeness judgment in
   the agent. Later the same day he asked for 0.7 s, then 0.1 s after trying it (the callbot followed, its spec 005), then 0.7 s for stts only while the callbot stays at its minimum, and: "Continue listening
   rather than respond when it suspects I wasn't done speaking. Bias towards
   that so I'm never cut off." The short pause is safe only because an
   unfinished-sounding turn gets the long hold.
2. `daemon.log` showed a `recognizer error network` every minute or so, even
   in silence. Every error raised a counter that only a recognized word reset,
   and the restart waited `100 * 2^count` ms, up to 5 s. After a quiet stretch
   every restart waited the full 5 s, and anything said then was never heard.
3. While the agent spoke, the page dropped anything with fewer than two content
   words, any text Edge had not finalised yet, and, with speakers, everything
   said after the voice ended but before the turn changed.

## How it works

- **Pause.** `PAUSE_DEFAULT_MS = 700` in `src/stts_ui.html`, saved in the
  window's `localStorage` (`__stts__autosend_ms`). `migratePause` runs once per
  profile: a saved `3500`, `2000`, `1000`, `300` or `100` (earlier defaults) becomes `700`,
  then the marker `__stts__autosend_ms_v6` is written, so a value Mark sets
  later is never changed again.
- **Hold.** `HOLD_DEFAULT_MS = 1000` (Mark 2026-09-30: 2.2 s felt slow; a saved 2200 moves to 1000 once), saved as `__stts__hold_ms`, set in the
  Auto-send row ("s if it trails off"). `readsUnfinished(text)` checks the last
  word against one fixed list (connectors, fillers, prepositions, articles,
  pronouns, lead-ins); the same list is in `src/protocol.ts` and in the call
  bot's `turn.mjs`. `quietMs(text)` picks the hold or the pause; the auto-send
  timer and the barge-in timer both use it.
- **Unfinished turns.** The daemon joins them (spec 044); the agent is never
  asked to listen again for the rest.
- **Open fast.** The `tts` description asks for a short first piece (3 to 6
  words) without listen, then the rest in one call with listen; at most two
  pieces per reply.
- **Restart.** The recognizer's `end` hook restarts it after
  `restartDelay(errStreak)`: 0 ms for a first error, then 250, 500, 1000 ms,
  capped at 2 s. The streak counts only errors less than 10 s apart and resets
  on any recognized word. A `start()` that throws retries with a widening delay
  up to 2 s, and the spec 011 watchdog still catches a recognizer that died
  silently.
- **During the agent's turn.** The agent's own voice is removed by the browser's
  echo canceller before recognition (spec 037). Talking over it never
  stops the voice (spec 016). Nothing else heard in the agent's turn is kept
  (spec 042).

### Parity with the call bot

| Behavior | stts | callbot (its spec 005) | Why they differ |
| --- | --- | --- | --- |
| Silence before a turn is sent | 0.7 s, a setting in the window (a saved 3.5, 2, 1, 0.3 or 0.1 s moves to 0.7 once) | 0.1 s default (its minimum), `CALLBOT_PAUSE_MS` | Mark's preference (2026-09-30): stts 0.7 s, callbot kept at its minimum; stts keeps a per-window saved setting, the call bot has an env var |
| When the turn reads unfinished | Waits 1 s, a setting in the window | 3 s more quiet before the turn is released (its spec 014) | Same outcome: the server joins the rest |
| A transcript that repeats one already answered | Never returned (spec 044) | Never returned (its spec 014) | Same |
| What counts as unfinished | Last word in one fixed list | The same list | Same; neither recognizer punctuates reliably, so the last word is the signal |
| The agent is told | Tool descriptions (turn protocol, spec 044) | The same (its spec 014) | Same |
| Recognizer restart after an error | At once, backoff only on rapid repeats | Not applicable | The call bot has no recognizer of its own; Recall transcribes on its servers |
| Words said over the voice | Kept for the next prompt; the voice finishes | Kept, delivered with `OVER_HER`; she finishes | Same outcome |
| Own voice heard back | Browser echo canceller (spec 037) | Per-participant streams, skipped by speaker name (callbot spec 011) | Channel: browser mic vs meeting streams |

## What it reads and writes

- Reads and writes `__stts__autosend_ms`, `__stts__hold_ms` and the one-time
  marker `__stts__autosend_ms_v6` in the voice window's `localStorage`.
- Writes nothing new to disk. Recognizer errors and restarts still go to
  `daemon.log` (spec 011).

## How to run, check, and hand over

```
npm run build
node --test test/*.test.mjs
```

`test/speech-not-split.test.mjs` lifts code out of the real page: the default
pause is 0.7 s; a saved 3.5, 2, 1, 0.3 or 0.1 s moves once and a later choice stays;
"and", "so i was thinking", "because the", "we could um" and "I went to the"
get the 1 s hold while finished sentences get 0.7 s, three rounds, and the
page's list and `protocol.ts` agree on every case; both timers use `quietMs`;
the first restart waits 0 ms and the cap is 2 s; short or unfinished words
from Mark are kept while the agent's own words are dropped. The whole suite
was run three times, all green.

Live check: the Talk panel shows `0.1` s and `1` s; saying "so I was
thinking" and pausing a second does not send.

Hand over: this spec, `migratePause`, `readsUnfinished`, `quietMs`,
`restartDelay`, `ownVoice` and the `currentMode === 'tts'` branch of
`onResult` in `src/stts_ui.html`, and `readsUnfinished` in `src/protocol.ts`.
