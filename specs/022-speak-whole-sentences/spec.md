# 022 - The page queues one utterance per sentence

## What it does

`startSpeaking` (upstream code) queues one `SpeechSynthesisUtterance` per
sentence, and the Piper shim (spec 038) renders one clip per sentence (spec
039). The agent writes normal, natural sentences; there is no punctuation
guidance.

## Why it exists

Mark (2026-10-01): with Piper on this PC there is no per-request network
cost, so the punctuation-clip workaround and its writing rules are gone and
Piper's natural pauses are back.

## How it works

- `startSpeaking` in `src/stts_ui.html` cuts the request into sentences with
  `Intl.Segmenter`; a `localService` browser voice gets one utterance per part
  (spec 033). Spec 038's shim renders each sentence as one clip.
- The microphone resumes only when nothing is left queued (`synth.pending`
  is false).
- Long content is cut on the server by `toParts` in `src/read-aloud.ts`
  (parts of at most 1000 characters); Stop and resume by part (spec 013) work
  unchanged.
- `commands/stts.md`, `commands/stts.toml` and the `tts` tool description in
  `src/stts-mcp-server.ts` carry no punctuation rule (test
  `one-utterance.test.mjs`).

## What it reads and writes

Reads the text the agent passes to `tts`. Writes nothing.

## How to run, check, and hand over

```
npm run build
node --test test/*.test.mjs
```

`test/one-utterance.test.mjs` checks the page cuts sentences and that all
three guidance places ask for as many marks as read naturally.
