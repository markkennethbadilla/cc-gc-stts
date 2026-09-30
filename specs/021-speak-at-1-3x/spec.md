# 021 - The voice speaks at 1.3x by default

## What it does

The voice window speaks at 1.3x unless Mark picks another speed on the Rate
slider. A window that still has the old default of 1x saved moves to 1.3x once;
a speed he chose himself (anything other than 1, or 1 set after the move) is
kept.

## Why it exists

Mark (2026-09-30, in a call): speak at 1.3x by default, in stts and the call
bot alike (house rule 67). The call bot's side is its spec 007.

## How it works

- `RATE_DEFAULT = 1.3` in `src/stts_ui.html`; `rate()` falls back to it when
  nothing valid is saved, and still clamps to 0.5 to 2.
- On first load after this change, if `__stts__rate` is exactly `1` it becomes
  `1.3`, and `__stts__rate_v2` is set so this happens only once.
- Every utterance takes its rate from `rate()`, as before.

### Parity with the call bot

| Behavior | stts (this spec) | callbot (its spec 007) | Why they differ |
| --- | --- | --- | --- |
| Default speed | 1.3x, Rate slider in the window | 1.3x (`+30%`), `CALLBOT_RATE` | stts keeps a per-window setting; the call bot has an env var only |
| Silence around each phrase | Left to the browser voice | Trimmed to the words plus 0.12 s | Channel: `speechSynthesis` gives the page no access to the audio, so there is nothing to trim; Mark reports no gaps in stts |

## What it reads and writes

- Reads and writes `__stts__rate` and `__stts__rate_v2` in the window's
  local storage.

## How to run, check, and hand over

```
npm run build
node --test test/*.test.mjs
```

`test/rate-default.test.mjs` lifts the rate block from the real page, three
rounds: nothing saved gives 1.3; a saved 1 moves to 1.3; 1.6 and 0.8 are kept;
a 1 saved after the move stays 1; 9 clamps to 2; junk falls back to 1.3.

Not tested live: open the voice window; the Rate slider should read 1.3x.

Hand over: this spec and the rate block in `src/stts_ui.html`.
