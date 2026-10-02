# 026 - A helper or a test cannot close the live voice window

## What it does

Only the main agent session in the voice loop can close the voice window. A
background helper agent that calls `tts` with `close`, or a test that starts a
daemon of its own, leaves the live window alone.

## Why it exists

On 2026-09-30 the voice window closed during a live conversation while a helper
agent was testing stts. Two doors allowed that. A `tts` call with `close` from
any agent closed the window. And a test daemon on its own port still opened its
browser with the same profile as the live window, so both windows could land in
one browser process.

## How it works

In `src/stts-daemon.ts`:

- The house hook tells the daemon who is calling (`who = session|agent`). A main session has an empty agent part. `close` is honoured only
  when the caller is a main session, or when no hook has named anyone.
- A daemon on any port other than 15986 uses the profile folder
  `profile-<port>` instead of `profile`.

The End conversation button and `/api/shutdown` are unchanged: they are Mark's.

### Parity with the call bot

| Behavior | stts | callbot | Why they differ |
| --- | --- | --- | --- |
| Helper cannot end the session | `close` ignored from helpers | `leave_call` has no caller identity | Channel limit: the call bot MCP is a remote server and sees no agent id; rule 66 keeps helpers off call tools |

## What it reads and writes

Reads `voiceOwner`, which the daemon already keeps. Writes a separate browser
profile folder for test ports under `%LOCALAPPDATA%/cc-gc-stts/`.

## How to run, check, and hand over

`node build.mjs`, then `node --test test/*.test.mjs`.
`test/window-guard.test.mjs` checks both guards.
