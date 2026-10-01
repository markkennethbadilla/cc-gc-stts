# Replace a stale daemon

## What it does
When the MCP server finds a running daemon that belongs to a different plugin directory, it shuts that daemon down and starts its own. A daemon with a live voice window is left alone until the window ends.

## Why it exists
The daemon outlives sessions. After a plugin update and restart the new server kept using the old daemon, so the old UI was served and the mic picker never showed.

## How it works
`/api/ping` answers `ok` with an `X-Stts-Dir` header holding the daemon's own directory. Before each request the client compares it to its own daemon directory (`stopStaleDaemon` in `src/daemon-client.ts`). A mismatch, or no header (an old daemon), is stale: if `/barge` reports `open: false` the client posts `/api/shutdown`, waits for the port to free, then the normal start path spawns the new daemon.

## What it reads and writes
Reads the ping header and `/barge`; writes only the shutdown call.

## How to run, check, and hand over
`node --test test/stale-daemon.test.mjs`. Live check: update the plugin, restart, make a voice call; the daemon log shows a fresh start.
