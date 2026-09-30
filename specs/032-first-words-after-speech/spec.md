# 032 - The first words after the agent speaks are heard

## What it does

With speakers (Headphone mode off), Mark can start talking the instant the
agent stops, and his first words reach the prompt. The microphone is off for
all but the agent's last sentence and starts fresh when that sentence starts,
so it is already listening when the voice stops; what it hears of the agent's
own voice is thrown away.

## Why it exists

Mark (2026-10-01): "after the agent finishes speaking, when I start talking
immediately, the first seconds are not caught; the transcript starts
mid-sentence." The page stopped the speech recognizer when the agent started
talking and started it again when the agent finished. The browser's
recognizer takes about a second to start listening again, so everything he
said in that second was never heard. A second cause: for 1.5 s after the
speech ended, anything heard while the window was still in its speaking state
was treated as the agent's voice and dropped whole.

The first fix (commit 9d04e8d) kept one recognizer session open through the
whole reply. Live, the browser then ended that session with a `network`
error as Mark answered, and his words were lost (2026-10-01). The browser
ends a session with `network` about once a minute anyway (daemon.log), so a
long session is likely to hit it at the worst moment, and back-to-back
`network` errors also widened the restart wait up to 2 s.

## How it works

All in the fork script block of `src/stts_ui.html`.

- `onSpeakStart` runs when each sentence starts (speakers mode, not paused
  by Mark). While more sentences are queued (`synth.pending`) it pauses and
  aborts the mic. On the last sentence it starts the mic again, or, if the
  mic was running (a one-sentence reply), aborts it so the `end` hook starts a
  fresh session at once. The start-up second is hidden under the last
  sentence and the session is new when Mark answers. `unmuteMic` at the end
  still resumes a mic that is paused (a cancelled reply).
- A recognizer session that ended with `network` restarts with no wait;
  only other rapid errors widen the restart delay (spec 019).
- `onResult`: while `synth.speaking` in speakers mode every result is dropped,
  and `echoIdx` records the last result index heard during the speech.
- A result at or below `echoIdx` can run on into Mark's reply when he answers
  at once. `stripEcho` cuts its leading words that are in what the agent just
  said and keeps the rest. Results that start after the speech are kept whole.
  `echoIdx` resets when the recognizer session ends.
- `ownVoice` drops everything only while the agent is actually speaking; after
  the end it uses the word match, like Headphone mode.
- The existing late-echo check (`isSpokenBack`, 4+ words nearly all from the
  agent) still guards the prompt box.

Known limit: if Mark's first words are also words the agent just said, and he
starts before the agent's last result closed, those first words are cut.

### Parity with the call bot

| Behavior | stts | callbot | Why they differ |
| --- | --- | --- | --- |
| Words said right after the voice stops | Heard: a fresh mic session starts with the last sentence | Heard: nothing is stopped | Channel: the call bot has no recognizer to restart; Recall transcribes every participant continuously on its servers and labels the bot's own lines |

## What it reads and writes

Reads the recognizer's results and the text being spoken (`ttsTextarea`).
Writes the prompt box, the carry and the barge-in, as before. No new storage.

## How to run, check, and hand over

- `npm run build`, then `node --test test/*.test.mjs`.
  `test/first-words-after-speech.test.mjs` drives the real `onResult` and
  `stripEcho` with the answer-at-once sequence; `mute-survives-listens` checks
  the mic is off for earlier sentences and on from the start of the last,
  with no restart at the end; `mic-restart` checks a `network` end restarts
  with no wait. Live check needs the window reopened.
- Live check: Headphone mode off, ask for a reply with listen on, start
  talking the moment it stops; the whole sentence lands in the box.
- The window loads the new page on its next open.
