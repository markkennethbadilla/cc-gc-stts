# 021 - The voice speaks at 1.1x by default

## What it does

The voice window speaks at 1.1x unless Mark picks another speed on the Rate
slider. A window that still has an old default saved (1x or 1.3x) moves to 1.1x
once; a speed he chose himself (any other value, or any value set after the
move) is kept.

## Why it exists

Mark (2026-10-02): default speaking speed 1.1 in stts and the call bot alike
(house rule 67; it was 1.3 from 2026-09-30). The call bot's side is its spec 007.

## How it works

- `RATE_DEFAULT = 1.1` in `src/stts_ui.html`; `rate()` falls back to it when
  nothing valid is saved, and still clamps to 0.5 to 2.
- On first load after this change, if `__stts__rate` is exactly `1` or `1.3`
  it becomes `1.1`, and `__stts__rate_v3` is set so this happens only once.
- Every utterance takes its rate from `rate()`; Piper gets
  `length_scale = 1 / rate` (about 0.909 at 1.1). `src/piper.ts` also falls
  back to 1.1 when a clip request carries no rate.

### Parity with the call bot

| Behavior | stts (this spec) | callbot (its spec 007) | Why they differ |
| --- | --- | --- | --- |
| Default speed | 1.1x, Rate slider in the window | 1.1x, `CALLBOT_RATE` | stts keeps a per-window setting; the call bot has an env var only |

## What it reads and writes

- Reads and writes `__stts__rate` and `__stts__rate_v3` in the window's
  local storage.

## How to run, check, and hand over

```
npm run build
node --test test/*.test.mjs
```

`test/rate-default.test.mjs` lifts the rate block from the real page, three
rounds: nothing saved gives 1.1; a saved 1 or 1.3 moves to 1.1; 1.6 and 0.8
are kept; 1 or 1.3 saved after the move stays; 9 clamps to 2; junk falls back
to 1.1.

Hand over: this spec and the rate block in `src/stts_ui.html`.
