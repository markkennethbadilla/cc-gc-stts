# 022 - The page queues one utterance per sentence

## What it does

`startSpeaking` (upstream code) queues one `SpeechSynthesisUtterance` per
sentence. Since spec 034 each utterance is cut again, at every punctuation
mark, into clips rendered by Microsoft's online voices, so where the agent
puts punctuation decides where audio starts sooner. The agent's phrasing rule
is the call bot's: short phrases, as many punctuation marks as read naturally
(Mark 2026-10-01, rule 67).

## Why it exists

Mark (2026-10-01): stts and the call bot use the same voices and the same
latency technique, so the agent writes for both the same way. The earlier
"periods only" rule existed because every browser utterance boundary was a
long pause; clips rendered ahead (spec 034) have no such pause.

## How it works

- `startSpeaking` in `src/stts_ui.html` cuts the request into sentences with
  `Intl.Segmenter`; a `localService` browser voice gets one utterance per part
  (spec 033). Spec 034's shim takes each utterance and cuts it into clips.
- The microphone resumes only when nothing is left queued (`synth.pending`
  is false).
- Long content is cut on the server by `toParts` in `src/read-aloud.ts`
  (parts of at most 1000 characters); Stop and resume by part (spec 013) work
  unchanged.
- The phrasing guidance lives in `commands/stts.md`, `commands/stts.toml` and
  the `tts` tool description in `src/stts-mcp-server.ts`.

## What it reads and writes

Reads the text the agent passes to `tts`. Writes nothing.

## How to run, check, and hand over

```
npm run build
node --test test/*.test.mjs
```

`test/one-utterance.test.mjs` checks the page cuts sentences and that all
three guidance places ask for as many marks as read naturally.
