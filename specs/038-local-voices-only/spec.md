# 038 - The window speaks with Piper, on this PC

## What it does

The window reads the agent's replies aloud with Piper (OHF-Voice/piper1-gpl),
a neural voice that runs on this PC. Nothing spoken goes over the network. The
voice bar lists the installed Piper voices (US and UK English), then the local
Windows voices as the fallback. Every clip and utterance is logged to
`daemon.log`.

## Why it exists

Mark (2026-10-01): no online text-to-speech. The online path (spec 034,
edge-tts-universal) went silent mid-session with nothing in the log: the page's
clip queue waited forever on one stalled render, so every later reply was
silent. Spec 034 is deleted; git keeps its history. Piper was picked over
Kokoro because it is lighter (CPU only, about 60 MB per voice, a short clip
renders in well under a second).

## How it works

- Install: mkb-agentops `scripts/setup-stts.ps1` makes a venv at
  `%LOCALAPPDATA%/cc-gc-stts/piper/venv` with the pinned `piper-tts[http]`
  and downloads the pinned voices (Hugging Face `rhasspy/piper-voices` tag
  `v1.0.0`) into `.../piper/voices`. Pins live in mkb-agentops `versions.json`.
- `src/piper.ts`: on the first clip the daemon starts Piper's own HTTP server
  (`python -m piper.http_server`, port 15987, `127.0.0.1` only) and proxies
  `/voice/voices` (installed voices), `/voice/split` (the call bot's
  punctuation cut, `src/clauses.ts`) and `/voice/clip` (one WAV; rate becomes
  `length_scale = 1 / rate`, so the 1.3x default of spec 021 holds). A render
  has a 20 s limit (first use of a voice loads it, about 6 s). The page asks for the voice list on load, which starts the server (about 8 s).
- `src/stts_ui.html` replaces `speechSynthesis.speak/cancel/speaking/pending`:
  each utterance is cut at punctuation, up to three clips render ahead while
  one plays through WebAudio (volume through a gain node). A clip fetch has a
  25 s limit and playback a watchdog, so one stalled clip can never silence
  the queue again. A failed clip is spoken by a local Windows voice and the
  status line says so.
- A Windows voice picked in the bar bypasses Piper and speaks each part as one
  utterance (spec 033).
- Logs in `daemon.log`: `page tts speak ...`, `piper clip ok|failed ...`,
  `page tts audio <state>`, `page tts clip watchdog`.

### Parity with the call bot

| | stts | callbot |
|---|---|---|
| Engine | Piper, local | Microsoft online voice (edge-tts-universal) |
| Why | runs on Mark's PC | runs on the server IP with no local voices; its own helper owns any change there |
| Cut and render-ahead | same `clauses()` table, three ahead | same |

## What it reads and writes

Reads the installed Piper voices, the saved voice (`__stts__voice`) and rate.
Writes log lines to `%LOCALAPPDATA%/cc-gc-stts/daemon.log`. Starts one local
Python process that ends with the daemon.

## How to run, check, and hand over

```
npm run build
node --test test/*.test.mjs
```

`test/piper-voice.test.mjs` renders a clip with every installed voice (skipped
when Piper is not installed). Live: call `tts`, then read the `piper clip ok`
and `page tts` lines in `daemon.log`.
