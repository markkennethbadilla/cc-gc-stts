# 019 - Sentences are not split at a thinking pause, and nothing is lost to a restart

## What it does

- The voice window waits 3.5 seconds of silence before it sends what Mark said,
  instead of 2 seconds. A pause to think in the middle of a sentence no longer
  sends half the sentence.
- When the speech recognizer stops (Edge ends it with a `network` error about
  once a minute), it starts again at once instead of waiting up to 5 seconds
  with the microphone deaf.
- Words Mark says while the agent is speaking are kept for his next message,
  unless they are the agent's own voice coming back through the microphone.
  Before, short words, words the recognizer never finished, and words said just
  after the voice stopped were thrown away.

## Why it exists

Mark (2026-09-30): his speech arrived in pieces and parts of it were missing.
Three causes, all in the page:

1. Auto-send fired after 2 s of silence, so a thinking pause split a sentence
   into two messages.
2. `daemon.log` showed a `recognizer error network` every minute or so, even
   in silence. Every error raised a counter that only a recognized word reset,
   and the restart waited `100 * 2^count` ms, up to 5 s. After a quiet stretch
   every restart waited the full 5 s, and anything said then was never heard.
3. While the agent spoke, the page dropped anything with fewer than two content
   words, any text Edge had not finalised yet, and, with speakers, everything
   said after the voice ended but before the turn changed.

## How it works

- **Pause.** `PAUSE_DEFAULT_MS = 3500` in `src/stts_ui.html`. The pause is a
  saved setting in the window's `localStorage` (`__stts__autosend_ms`).
  `migratePause` runs once per profile: if the saved value is `2000`, the old
  default, it becomes `3500`. It then writes the marker `__stts__autosend_ms_v2`,
  so a value Mark sets later, 2 s included, is never changed again.
- **Restart.** The recognizer's `end` hook restarts it after
  `restartDelay(errStreak)`: 0 ms for a first error, then 250, 500, 1000 ms,
  capped at 2 s. The streak counts only errors less than 10 s apart and resets
  on any recognized word, so the once-a-minute `network` end always restarts at
  once. A `start()` that throws retries with a widening delay up to 2 s, and the
  spec 011 watchdog still catches a recognizer that died silently.
- **During the agent's turn.** `ownVoice(text)` decides what is the agent's own
  voice: heard while it speaks or within 1.5 s after, and nearly all words from
  the text it is saying (with speakers, everything heard while it speaks, as
  before, since the microphone is paused then anyway). That is dropped.
  `isEcho(text)` still decides whether talking over it stops the voice: not its
  own voice and two or more content words (spec 016). Everything else heard in
  the agent's turn goes into `carry` (finals) or the held interim (unfinished
  text, spec 012), so it starts his next prompt or, if the agent goes idle
  instead of listening, reaches it as a barge-in after his pause.

### Parity with the call bot

| Behavior | stts | callbot | Why they differ |
| --- | --- | --- | --- |
| Silence before a turn is sent | 3.5 s, a setting in the window | 3.5 s default, `CALLBOT_PAUSE_MS` | Same |
| Recognizer restart after an error | At once, backoff only on rapid repeats | Not applicable | The call bot has no recognizer of its own; Recall transcribes on its servers |
| Short or unfinished words said over the voice | Kept for the next prompt; two or more content words stop it | Delivered with a note (`OVER_HER_SHORT`); two or more content words stop her | Channel: Recall always finalises a line and names the speaker, so the call bot can hand every line over at once |
| Own voice heard back | Dropped by word match | Dropped by speaker name | Channel: Recall labels the bot's own lines |

## What it reads and writes

- Reads and writes `__stts__autosend_ms` and the one-time marker
  `__stts__autosend_ms_v2` in the voice window's `localStorage`.
- Writes nothing new to disk. Recognizer errors and restarts still go to
  `daemon.log` (spec 011).

## How to run, check, and hand over

```
npm run build
node --test test/*.test.mjs
```

`test/speech-not-split.test.mjs` lifts `migratePause`, `restartDelay` and
`ownVoice` out of the real page: the default is 3.5 s, a saved 2 s moves once
and a later 2 s stays, other values never move, the first restart waits 0 ms and
the cap is 2 s, and short or unfinished words from Mark are kept while the
agent's own words are dropped. `echo.test.mjs` still proves a backchannel does
not stop the voice.

Live check: `daemon.log` after a quiet stretch shows `recognizer error network`
lines with no gap in what was heard; the Talk panel shows `3.5` s.

Hand over: this spec, and `migratePause`, `restartDelay`, `ownVoice` and the
`currentMode === 'tts'` branch of `onResult` in `src/stts_ui.html`.
