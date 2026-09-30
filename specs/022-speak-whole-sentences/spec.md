# 022 - The voice speaks whole sentences, and the agent writes only periods

## What it does

The voice window cuts a reply only at sentence ends, and speaks each sentence
in one piece. It no longer cuts speech at every comma or other mark.

The agent is told to use only periods, and sparingly, one at the end of each
complete thought. No commas, colons, semicolons, dashes or parentheses: each
is replaced by a connector word (and, so, then, but, because, which), never
just dropped to leave a run-on fragment (Mark 2026-09-30).

## Why it exists

Mark (2026-09-30): the per-punctuation cut (the old spec 020) made the voice
sound slow. Edge's Microsoft Natural voices leave a long pause at every
utterance boundary, so a reply cut at every comma paused at every comma. The
voice itself is near instant, so starting at the first comma bought nothing
here. The call bot is the opposite (high latency), so it keeps the small cuts
and asks for many marks (rule 67, table below).

## How it works

- `startSpeaking` in `src/stts_ui.html` cuts the request into sentences with
  the platform's `Intl.Segmenter` (the same segmenter `toParts` uses on the
  server) and queues one `SpeechSynthesisUtterance` per sentence. The first
  sentence's `start` marks the window speaking; the last one's `end` finishes
  the turn.
- The microphone mute (spec 016) resumes only when no sentence is left in the
  queue (`synth.pending` is false), so it does not flicker between sentences.
- Long content is still cut on the server by `toParts` in `src/read-aloud.ts`
  (sentences packed into parts of at most 1000 characters). Each part is one
  request, so Stop and resume by part (spec 013) work unchanged.
- The phrasing guidance lives in `commands/stts.md`, `commands/stts.toml` and
  the `tts` tool description in `src/stts-mcp-server.ts`.

### Parity with the call bot

| Behavior | stts (this spec) | callbot (spec 006) | Why they differ |
| --- | --- | --- | --- |
| Where speech is cut | Sentence ends only (`Intl.Segmenter`) | `clauses()`, every punctuation mark | Channel: every utterance boundary is a long pause in Edge speechSynthesis; the call bot renders audio on a server and a small clip reaches the call sooner |
| How a piece is played | One browser utterance per sentence | One rendered clip per piece; a piece over 300 characters is cut at a word | Channel, as above |
| Resuming a long read | By 1000-character part | By piece | Channel: the call bot plays and counts clips; stts sends parts to the window |
| Agent guidance on punctuation | Only periods, sparingly; connector words replace every other mark | As many marks as read naturally, so clips are small | Channel: latency is low in stts and high in the call bot (Mark 2026-09-30) |

## What it reads and writes

Reads the text the agent passes to `tts`. Writes nothing new.

## How to run, check, and hand over

```
npm run build
node --test test/*.test.mjs
```

`test/one-utterance.test.mjs` runs three times: the page (source and build)
has no comma splitter and cuts with the sentence segmenter, a comma-heavy
reply of three sentences becomes exactly three pieces, and all three guidance
places ask for periods only. Live: speak the same three-sentence comma reply
as comma pieces and as sentences in Edge with the same voice and rate, and
time both.

Hand over: this spec, `startSpeaking` in `src/stts_ui.html`, `toParts` in
`src/read-aloud.ts`.
