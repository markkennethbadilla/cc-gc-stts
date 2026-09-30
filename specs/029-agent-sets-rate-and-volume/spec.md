# 029 - The agent sets rate and volume for this window only

## What it does

The `tts` tool takes two optional numbers: `rate` (0.5 to 2, 1 is normal) and
`volume` (0 to 1). They change how the voice window speaks from that call on,
until the window closes or Mark moves the Rate slider himself. They are never
saved: the next window speaks at his saved rate and full volume again.

## Why it exists

Mark (2026-10-01, by voice): the agent must change speed (and volume) itself,
fast, before its next line, instead of driving the window by hand. Config
changes are for the running instance only unless he says to save them as the
default.

## How it works

- `src/stts-mcp-server.ts` accepts `rate` and `volume` and passes them with each
  part of the request; `src/stts-daemon.ts` forwards the request unchanged.
- In `src/stts_ui.html`, `applyLive(config)` keeps them in memory (`live`),
  clamped to their ranges; values that are not numbers are ignored. Every
  utterance uses `live.rate` if set, else the saved rate (spec 021), and
  `live.volume` if set. Nothing touches local storage.
- Moving the Rate slider clears `live.rate`, so his own choice wins. The rate
  label shows `(this window)` while an agent rate is in force.
- Volume is the standard `SpeechSynthesisUtterance.volume`; a voice that
  ignores it is a browser limit.

### Parity with the call bot

| Behavior | stts (this spec) | callbot (its spec 010) | Why they differ |
| --- | --- | --- | --- |
| Agent sets rate | `tts` `rate`, this window only | `call_say` `rate`, this call only | Same |
| Agent sets volume | `tts` `volume`, per utterance | `call_say` `volume`, Edge prosody | Same |
| Lasts until | window closes or slider moved | call session ends | stts has a slider he can move; the call bot has none |

## What it reads and writes

- Reads `rate` and `volume` from `tts` calls. Writes nothing to disk or local
  storage.

## How to run, check, and hand over

```
npm run build
node --test test/*.test.mjs
```

`test/live-rate-volume.test.mjs` lifts `applyLive` from the real page, three
rounds: set, kept across a request without them, clamped, junk ignored, and no
local storage in the block.

Not tested live: call `tts` with `rate: 1.8`; the label reads `1.8x (this
window)` and the next window is back to the saved rate.

Hand over: this spec and the `applyLive` block in `src/stts_ui.html`.
