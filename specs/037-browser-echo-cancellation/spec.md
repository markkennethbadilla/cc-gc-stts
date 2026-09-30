# 037 - The browser's echo canceller keeps the agent's voice out

## What it does

The microphone that feeds speech recognition is an echo-cancelled track from
the browser. The agent's own voice is removed from the sound before the
recognizer hears it, so there is no text filter, no speakers mode and no
headphone mode. The mic stays on while the agent speaks.

## Why it exists

Mark (2026-10-01): replace hand-rolled parts with maintained ones. Echo was
handled by comparing heard text with spoken text (the old specs 032 and 036
and `ownVoice`/`isSpokenBack`): four word-matching filters, a mode switch, and
the mic switched off during speech. They cut real words and still let echo
through. Chrome ships acoustic echo cancellation for exactly this.

## How it works

In the fork script block of `src/stts_ui.html`, on load the page asks for
`getUserMedia({audio: {echoCancellation, noiseSuppression, autoGainControl}})`.
`startMic` passes that track to `SpeechRecognition.start(track)` (Chrome 135+,
on-device recognition included). If the track is not live yet or ends, the
recognizer uses the default mic and a new track is requested.

Chrome-wide echo cancellation removes everything Chrome plays. The Microsoft
online voices (the default, spec 034) play through WebAudio in Chrome, so they
are cancelled. A Windows system voice picked in settings, or the fallback when
an online clip fails, plays outside Chrome and is not cancelled.

Evaluated and not adopted:

| Candidate | Decision |
| --- | --- |
| Silero VAD (`@ricky0123/vad-web`) for turn end | Not adopted. The recognizer's own `speechstart`/`speechend` events are the voice detector; the only timer is the configurable pause. A second VAD would add onnxruntime-web and a model to do the same job. |
| pipecat smart-turn for "reads unfinished" | Not adopted yet. It needs raw audio, onnxruntime-web and a Whisper feature extractor (tens of MB) to replace one word list. Revisit if cut-offs return. |
| `Intl.Segmenter` / `sentence-splitter` for clip cutting | Not adopted. Both cut "Mr. Smith" and URLs (see `src/clauses.ts`). |

### Parity with the call bot

| Behavior | stts | callbot (its spec 011) | Why they differ |
| --- | --- | --- | --- |
| Own voice kept out | Browser echo canceller on the mic track | Recall per-participant streams; her own lines skipped by speaker name | A browser mic vs a meeting that already separates each person's audio |
| Text echo filter | None | None | Same |
| Turn end | Recognizer speech events plus the pause | Recall speech_on/off plus the pause | Each channel's own voice detector |

## What it reads and writes

Reads the microphone through `getUserMedia`. Writes `echo-cancelled mic ready`
or `echo-cancelled mic failed` to daemon.log.

## How to run, check, and hand over

`node --test test/echo-cancelled-mic.test.mjs`. Live: daemon.log shows
`echo-cancelled mic ready`; with speakers, a spoken reply leaves nothing in
the prompt box.
