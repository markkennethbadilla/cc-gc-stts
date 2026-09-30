# 023 - An unfinished-looking turn gets a one-second check, not a full wait

## What it does

When a transcript reads unfinished (it ends on "and", "so", a half
sentence), the agent listens again with `idleSec 1`. If more speech comes, it
joins the pieces. If the listen returns `__STTS_NO_SPEECH__`, Mark has finished,
and the agent answers what it has. Every other wait keeps the default idleSec.

## Why it exists

Live on 2026-09-30, Mark finished a thought ("...so that they don't
incorrectly fill things out"). The agent judged it unfinished and called a
plain listen, which waits up to the full idle window (200 seconds). Mark had
to speak again or wait minutes. Mark: 5 seconds is too long, use 1.

## How it works

- `midThought`, `NO_SLEEP_NOTE` and `UNFINISHED_NOTE` in
  `src/stts-mcp-server.ts` say: listen again with idleSec 1; if that returns
  `__STTS_NO_SPEECH__`, answer. The same words are in `skills/stts/SKILL.md`,
  `commands/stts.md` and `commands/stts.toml`.
- One second is safe: the page's idle timer (`armIdle` in `src/stts_ui.html`)
  never fires while an interim transcript is pending or the mic hears speech;
  it re-checks every second instead. Speech buffered between calls is
  returned first.

### Parity with the call bot

| Behavior | stts | callbot (spec 008) | Why they differ |
| --- | --- | --- | --- |
| Unfinished-turn check listen | idleSec 1, then answer on no speech | idleSec 1, then answer on no speech | Same |
| Where the agent reads it | tool descriptions and the note returned with an unfinished transcript | tool descriptions (`UNFINISHED`) | Callbot never had a per-turn returned note; its room-quiet pause already holds a turn |

## What it reads and writes

Nothing new. Only tool text changes.

## How to run, check, and hand over

`node build.mjs`, then `node --test test/*.test.mjs`
(`speech-not-split.test.mjs` and `no-speech-idle.test.mjs` assert the text).
