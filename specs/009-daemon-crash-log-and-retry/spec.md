# 009: Daemon crash log and one retry

## What it does

When the voice daemon dies in the middle of a voice turn, the agent starts a
fresh daemon and sends the same request once more, so Mark hears the answer
instead of silence. Every daemon also writes a start line, an exit line, and
any crash stack to a log file, so the next death can be explained.

## Why it exists

On 2026-09-26 the daemon died between an `stt` answer and the next `tts`.
The agent's call failed with `read ECONNRESET`, the voice window went quiet,
and Mark asked why it exited. The daemon ran with its output discarded, so
nothing recorded the cause.

## How it works

- `spawnDaemon` (`src/daemon-client.ts`) opens the log in append mode and hands
  it to the daemon as stdout and stderr. Node prints an uncaught crash there on
  its own.
- The daemon (`src/stts-daemon.ts`) writes a `daemon start pid N` line when it
  listens and a `daemon exit pid N code C` line when it exits. A start with no
  matching exit means it was killed from outside.
- `sendWithRetry` wraps every `stt` and `tts`. On `ECONNRESET`,
  `ECONNREFUSED` or `EPIPE` it runs `ensureDaemon` again and sends once more.
  Busy (409), timeouts and any other error are not retried. A second failure
  goes back to the agent.

## What it reads and writes

Writes `%LOCALAPPDATA%\cc-gc-stts\daemon.log` on Windows, or
`~/.local/share/cc-gc-stts/daemon.log` elsewhere. It holds timestamps, process
IDs, exit codes and stacks. No speech text and no secrets.

## How to run, check, and hand over

```
node --test test/daemon-gone-retry.test.mjs
```

The test runs a real server that resets the socket, and checks one retry, no
second retry, and no retry for busy or timeouts. To check live, kill the
daemon's `node.exe` while the window is listening: the next voice call still
answers, and `daemon.log` shows a start with no exit.
