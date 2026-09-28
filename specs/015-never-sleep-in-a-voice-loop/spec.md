# 015 - Never sleep in a voice loop

## What it does

In a voice loop the agent never waits by sleeping or by blocking on any tool
other than `stt` or `tts` with `listen`. To wait for Mark it calls `stt` again
with a long `idleSec` (up to 200), so it answers the moment he stops talking.

The daemon's `/barge` answer now also says whether the voice window is
connected: `{ "text": "...", "open": true }`. The house hook in `mkb-agentops`
(`stts-barge.mjs`) reads that and refuses a shell `sleep`, `Start-Sleep`,
`timeout /t`, or the windows-mcp `Wait` tool while the window is open.

## Why it exists

On 2026-09-29 an agent in `/stts` ran `sleep 55` between two `stt` calls to
"wait". Mark's speech during the sleep was captured, but the agent could not
answer until the sleep ended, so he talked into a dead agent. Mark: "that
needs to happen every single time permanently".

## How it works

- `/stts` command text (`commands/stts.md`, `commands/stts.toml`), the plugin
  skill, and the `stt` and `tts` tool descriptions carry one sentence: never
  sleep or block on another tool to wait for him; call `stt` again with a long
  `idleSec`.
- `GET /barge` adds `open`: the page's websocket is connected. The window is
  open for the whole conversation and closes on End conversation or a final
  `tts` with `close`, so `open` is true exactly while a voice loop is live.
- An older daemon answers without `open`; the hook then lets everything
  through (fails open), as it does when no daemon runs at all.

## What it reads and writes

- Reads nothing new. `/barge` still drains the barge-in buffer it always did.
- Writes nothing.

## How to run, check, and hand over

```
node --test test/long-speech-and-read.test.mjs
```

The test "barge reports the window as open while it is connected" checks the
field against a real daemon on its own port. The refusal itself is tested by
`node .rulesync/hooks/stts-barge.mjs --self-check` in `mkb-agentops`.

Hand over: this spec, the `/barge` route in `src/stts-daemon.ts`, the
`NO_SLEEP_NOTE` in `src/stts-mcp-server.ts`.
