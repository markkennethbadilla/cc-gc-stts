# 032 - The first words after the agent speaks are heard

## What it does

With speakers (Headphone mode off), Mark can start talking the instant the
agent stops, and his first words reach the prompt. The microphone stays on
while the agent talks; what it hears of the agent's own voice is thrown away.

## Why it exists

Mark (2026-10-01): "after the agent finishes speaking, when I start talking
immediately, the first seconds are not caught; the transcript starts
mid-sentence." The page stopped the speech recognizer when the agent started
talking and started it again when the agent finished. The browser's
recognizer takes about a second to start listening again, so everything he
said in that second was never heard. A second cause: for 1.5 s after the
speech ended, anything heard while the window was still in its speaking state
was treated as the agent's voice and dropped whole.

## How it works

All in the fork script block of `src/stts_ui.html`.

- The speech hook no longer pauses the recognizer when an utterance starts
  (`muteMic` is deleted). `unmuteMic` stays, for a mic paused any other way.
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
| Words said right after the voice stops | Heard: the mic never stops during speech | Heard: nothing is stopped | Channel: the call bot has no recognizer to restart; Recall transcribes every participant continuously on its servers and labels the bot's own lines |

## What it reads and writes

Reads the recognizer's results and the text being spoken (`ttsTextarea`).
Writes the prompt box, the carry and the barge-in, as before. No new storage.

## How to run, check, and hand over

- `npm run build`, then `node --test test/*.test.mjs`.
  `test/first-words-after-speech.test.mjs` drives the real `onResult` and
  `stripEcho` with the answer-at-once sequence; `mute-survives-listens` checks
  a spoken reply no longer stops or restarts the mic.
- Live check: Headphone mode off, ask for a reply with listen on, start
  talking the moment it stops; the whole sentence lands in the box.
- The window loads the new page on its next open.
