# 043 - A finished background agent ends the listen at once

## What it does

When a background agent finishes while the voice agent is waiting in a listen,
the listen returns `__STTS_BACKGROUND_RESULT__` right away, so the agent speaks
the result now instead of after Mark next talks.

## Why it exists

Mark, 2026-10-03: finished background work only surfaced after he spoke again.
Claude Code delivers a task notification to the model only between tool calls;
a blocking MCP call (the listen) cannot see it. The supported signal is the
`SubagentStop` hook, which fires in the parent session when any subagent,
background ones included, finishes (code.claude.com/docs/en/hooks).

## How it works

- The plugin ships `hooks/hooks.json`: `SubagentStop`, matcher `.+` (skips
  Claude Code's internal agents, whose `agent_type` is empty), runs
  `hooks/notify-listen.mjs`.
- That script POSTs `/notify` to the daemon (port 15986 or `STTS_PORT`), 2 s
  timeout, always exits 0.
- The daemon: if a listen is open, it tells the page `released` (half-said words
  are kept for the next listen, spec 012) and answers the listen with
  `BACKGROUND_RESULT`. No listen open (agent working or speaking): nothing
  happens; the agent sees the result on its own turn.
- The `stt` and `tts` tool descriptions tell the agent to relay the result with
  `tts` and `listen`.

## What it reads and writes

`src/protocol.ts`, `src/stts-daemon.ts`, `src/stts-mcp-server.ts`, `hooks/`.
Test: `test/background-result.test.mjs`.

## How to run, check, and hand over

`npm run build`, then `node --test test/*.test.mjs`. Covered: the real hook ends
an open listen three times in a row inside 3 s and the page is told to keep his
words; notify with no listen or during a tts changes nothing; the hook exits 0
with no daemon; the matcher skips an empty agent type.

Limit: only Claude Code has this hook in the plugin. Agents using stts through
the gateway (Codex, Grok, OpenCode, Antigravity) still see a finished result at
the next `__STTS_NO_SPEECH__`.

| Behaviour | stts | callbot | Why |
| --- | --- | --- | --- |
| Background result ends the listen | `/notify` from the SubagentStop hook | Not yet: callbot runs on the VPS and cannot be reached by a local hook without a token; its `call_listen` caps at 85 s, so the result lands within 85 s | Channel limit (remote server, Cloudflare 100 s cut) |
