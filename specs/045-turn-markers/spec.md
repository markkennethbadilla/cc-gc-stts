# 045 - Turn markers: see and hear when to speak

## What it does

The window and the speakers tell Mark, at every moment, whether to speak.

A large banner across the top of the window holds one state:

| Banner | Means | Sound when it starts |
| --- | --- | --- |
| GREEN "Speak now" | The listen is open | Rising chime (it turns green when the chime ends) |
| AMBER "Heard: "his exact words" - working" | His turn was sent; the agent works on exactly those words | Soft tick, plus a spoken "Got it" if he turns that on |
| AMBER "Background result arrived - agent working" | A finished background agent ended the listen (spec 043) | Two-tone |
| BLUE "Agent speaking - wait" | The agent's voice is playing | None: the voice itself |
| GREY "Not listening" | Anything else | None |

Words said while it is grey or blue are not heard (spec 042), and the grey
banner shows them: `Not heard: "...". Say it again when this turns green.`

While he talks in a green state, a bar along the bottom of the banner pulses.
When he stops, it drains over the pause window (0.7 s, longer when the sentence
reads unfinished, spec 019); the turn is sent when it is empty. Talking again
refills it.

Settings (gear, "Markers"): chimes on or off (default on), chime volume
(default 0.5), say "Got it" (default off). Saved in the window.

## Why it exists

Mark, 2026-10-03: "I'd rather have markers so I know when to speak, when not
to, and what's being processed." The status line of spec 044 was small grey
text; he talks without looking at the screen.

## How it works

- `src/stts_ui.html`, the spec 045 block: `setTurnState(state, words)` paints
  the banner and plays the state's earcon only when the state changes, so each
  marker plays exactly once per transition. `activateStt` plays the chime first
  and opens the listen after it, so the chime is never recorded and a turn
  (the only way `tts` with `listen=true` or `stt` returns) always comes after
  it. While any earcon plays `globalThis.__earcon` is set and `onResult` drops
  results the same way as the agent's own voice (spec 037). `resetToIdle` sets
  heard or idle; `activateTts` sets agent speaking; `armPause` drives the bar
  through `globalThis.__countdown`.
- `src/stts-daemon.ts`: `GET /earcon/<name>.ogg` serves `src/earcons` (copied
  to `dist/earcons` by `build.mjs`); `/notify` sends `released` with
  `reason: 'background'`.
- `src/stts-mcp-server.ts`: `TURN_NOTE` tells the agent the chimes exist and
  not to announce listening itself.
- Earcons: Kenney "Interface Sounds", CC0, pinned by archive hash in
  `src/earcons/SOURCE.txt`. Nothing is synthesized.

### Parity with the call bot

The call bot plays the same listen-open chime and turn-captured tick into the
meeting, audio only, switchable per call; see its spec 014 parity table.

## What it reads and writes

Reads `src/earcons/*.ogg`. Writes `localStorage` keys `__stts__earcons`,
`__stts__earcon_vol`, `__stts__gotit`.

## How to run, check, and hand over

`npm run build`, then `node --test test/*.test.mjs`. `test/turn-markers.test.mjs`
checks one marker per transition, green only after the chime, the banner
words, one "Got it" per turn, that speech during a chime is not transcribed,
and that the countdown pulses while he talks and restarts when he stops.
`test/background-result.test.mjs` checks the earcon route and the
background reason. To swap a sound, replace the file in `src/earcons` and
update `SOURCE.txt`.
