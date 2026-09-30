# 024 - The newest request takes over; an interrupted call never locks the voice window

## What it does

When an `stt` or `tts` call arrives while an earlier one is still held, the
new call wins. The earlier call is answered `superseded` and the new one
proceeds at once. No call is ever refused as busy, so no one has to restart
the daemon by hand.

## Why it exists

Live on 2026-09-30, a `tts` call was interrupted mid-turn. Its request stayed
held in the daemon, and every later `stt` and `tts` came back "stts daemon is
busy with another request" until the daemon was restarted. The interrupt
never reached the daemon: an agent's cancel does not always close the HTTP
request (a gateway in between may not forward it), and the watchdog of spec
007 only frees it after up to 240 seconds. One voice window serves one
conversation, so a new call means the old caller is gone.

## How it works

- `src/stts-daemon.ts`, `POST /request`: if a request is pending, it is
  answered `504 superseded by a newer stts request`, its watchdog is cleared,
  and the new request takes its place. The page resets to the new request on
  its own (`connectSocket` in `src/stts_ui.html`).
- A superseded listen first sends the page `released`, the same message the
  time limit sends (spec 012), so anything Mark said is kept and returned by
  the next listen.
- `src/daemon-client.ts` no longer has a busy error.

### Parity with the call bot

| Behavior | stts | callbot | Why they differ |
| --- | --- | --- | --- |
| A second call while one is held | New one takes over, old one answered superseded | Never refused: each listen is one more waiter in a list, and speech goes to whichever returns first | Same outcome; callbot never had a single-request lock, so there is nothing to take over |

## What it reads and writes

Nothing new. The daemon's one pending slot changes hands instead of refusing.

## How to run, check, and hand over

`node build.mjs`, then `node --test test/*.test.mjs`.
`test/busy-takeover.test.mjs` runs a real daemon on its own port, leaves a
request unanswered (the stuck state), and checks the next call succeeds and
the page is told to keep what it heard. On the code before this spec, both
cases fail with 409.
