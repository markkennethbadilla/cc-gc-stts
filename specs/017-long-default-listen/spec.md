# 017 - A listen waits 200 seconds by default

## What it does

`stt`, and `tts` with `listen`, wait up to 200 seconds for Mark to speak before
returning `__STTS_NO_SPEECH__`. It was 20. 200 is the most the tool schema allows
(`idleSec` max 200) and it stays inside the 240-second call budget (spec 012). An
agent that is waiting on a background result it promised passes a short
`idleSec` (about 20) itself.

## Why it exists

Every empty return is a full model round trip that re-reads the whole context,
which costs tokens and usage for a silent room. An agent whose tool schema is
stale (a running Claude session behind the gateway still sees no `idleSec`)
could not ask for a longer wait, so it came back every 20 seconds. Claude Code's
main conversation uses a one-hour prompt cache on the subscription
(code.claude.com/docs/en/prompt-caching), so there is no cache-warm reason to
return often.

## How it works

- `DEFAULT_IDLE_SEC` in `src/protocol.ts` is 200. The MCP server passes it when
  the agent passes no `idleSec`. The page's idle timer (spec 010) is unchanged.
- The `/stts` command, the plugin skill and the tool descriptions say the default
  is already the longest wait, and when to pass a short one.

## What it reads and writes

- Reads the `idleSec` tool argument. Writes nothing.

## How to run, check, and hand over

```
node --test test/no-speech-idle.test.mjs
```

The test checks the default is 200 and under the 240-second budget, and that
both tools fall back to it.

Hand over: this spec and `DEFAULT_IDLE_SEC` in `src/protocol.ts`.
