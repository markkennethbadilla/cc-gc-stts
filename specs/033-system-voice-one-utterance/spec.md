# 033 - A system voice speaks each part in one piece

## What it does

When the voice in use is a system voice (Chrome reports `localService`), the
window speaks each part the server sends as one utterance instead of one per
sentence. Chrome's own network voices (Google US English) keep the per-sentence
cut from spec 022.

## Why it exists

Mark (2026-10-01): with the Microsoft Online voices (NaturalVoiceSAPIAdapter,
mkb-winops spec 043) the pause at every period was too long. Each utterance is
a separate SAPI call and so a new request to the online voice service; one
utterance per part means one request, and the service puts natural pauses at
punctuation itself.

## How it works

`startSpeaking` in `src/stts_ui.html` first picks the voice: the one chosen in
the voice bar (`localStorage` `__stts__voice`), else the spec 031 default. If
that voice has `localService`, the whole text becomes one utterance; otherwise
it is cut with `Intl.Segmenter` as in spec 022. Parts are still at most 1000
characters (server `toParts`), so Stop and resume by part are unchanged.

Parity with the call bot (rule 67): the call bot renders audio on a server and
keeps its per-clause clips (callbot spec 006); nothing changes there, because
the gap came from the browser's per-utterance request, not from the voice.

## What it reads and writes

Reads the text the agent passes to `tts` and the saved voice name. Writes
nothing new.

## How to run, check, and hand over

```
npm run build
node --test test/*.test.mjs
```

`test/one-utterance.test.mjs` checks the page (source and build) picks the
saved voice and speaks a `localService` voice as one utterance. Live: pick a
Windows voice, speak a three-sentence reply, listen for no long gap.
