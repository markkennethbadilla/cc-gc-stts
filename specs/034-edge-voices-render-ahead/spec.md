# 034 - The window speaks with Microsoft online voices, the call bot's way

## What it does

The voice window no longer asks the browser to speak. The stts daemon renders
speech with Microsoft's online (Edge) voices through `edge-tts-universal`
1.4.0, the same package and version as the call bot. Each reply is cut at every
punctuation mark, up to three clips are rendered ahead while one plays, and
each clip plays without the silence Edge puts before and after the words.
Rate (default 1.3), volume, voice, Stop, barge-in, and reading files and URLs in parts all
work as before. If a clip cannot be rendered (offline, service down), that
clip is spoken by the browser's own voice.

## Why it exists

Mark (2026-10-01, rule 67): stts and the call bot speak with the same voices,
so they use the same latency technique. Through the browser, each utterance
was a fresh request to the voice service with nothing fetched ahead, so first
audio was slow and every boundary was a gap. The window no longer uses the
NaturalVoiceSAPIAdapter (mkb-winops spec 043).

## How it works

- `src/clauses.ts` is a copy of the call bot's `clauses()` and `segment()`
  (callbot spec 006). The repos have different owners, so the text is copied;
  a change goes into both.
- `src/edge.ts`, mounted by the daemon: `GET /edge/voices` (every English
  locale), `POST /edge/split` (the text cut into clips), `GET /edge/clip`
  (`text`, `voice`, `rate`, `volume`; returns mp3 with `X-Speech-From` and
  `X-Speech-To` from Edge's word timings plus 0.12 s of tail). Any failure
  is a 502.
- `src/stts_ui.html`, at the top of the fork block, replaces
  `speechSynthesis.speak`, `cancel`, `speaking` and `pending`. Upstream code
  and the rest of the fork keep calling them unchanged. A clip plays through
  Web Audio; each clip start fires the utterance's `start` event (so
  `pending` is false on the last clip and the mic starts then), the last clip
  fires `end`, and a cancel fires `error` with `interrupted`.
- The voice picker lists the Microsoft online voices first, then the browser
  voices. A voice saved under its SAPI adapter name moves to the Edge name.
  With nothing saved, the voice is `en-US-AvaMultilingualNeural`. Picking a
  browser voice speaks through the browser, as before.

### Parity with the call bot

| Behavior | stts | callbot | Why they differ |
| --- | --- | --- | --- |
| Where speech is cut | `segment()` copy, every mark | `segment()`, every mark | Same |
| Renderer | edge-tts-universal 1.4.0 in the daemon | same, in server.mjs | Same |
| Render ahead | 3 clips | `RENDER_AHEAD` 3 | Same |
| Silence trim | Word timings plus 0.12 s tail | Same (`TAIL_S`) | Same |
| Default rate | 1.3 | +30% | Same |
| Default voice | en-US-AvaMultilingualNeural, picker | en-GB-SoniaNeural, fixed | Channel: Mark picks his own voice in the window |
| Fallback | Browser voice per clip | None | Channel: the call has no browser voice |
| Agent guidance | As many marks as read naturally | Same | Same |

## What it reads and writes

Reads the text sent to `tts` and the saved voice. Sends the text to
Microsoft's Edge speech service. Writes the saved voice name when it migrates
a SAPI name. Nothing is stored on disk.

## How to run, check, and hand over

```
npm run build
node --test test/*.test.mjs
```

`test/edge-voice.test.mjs` runs the call bot's cut table, a 5 MB stress cut,
checks the page wiring, and live-renders against Edge: voices listed, a clip
with trimmed timings, a 502 for empty text and an unknown voice. Live page
check (2026-10-01): a headless Chrome on a test daemon (port 15999) spoke two
utterances, first audio at 1.3 s, clips back to back, `pending` false on the
last clip, cancel gave `interrupted`.
