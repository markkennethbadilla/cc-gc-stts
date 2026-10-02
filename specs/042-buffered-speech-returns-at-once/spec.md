# 042 - Speech said while the agent works comes back the moment it listens

## What it does

Anything Mark finished saying while the agent was busy (between listens, or
over the agent's voice) is returned the instant the agent's next `stt` or
`tts` with `listen` opens. He does not have to speak again first.

## Why it exists

Mark, 2026-10-03: speech given while the agent worked showed in the window, but
the next listen did not return it. It came back only after he spoke again and
paused, both pieces together. The stts-barge hook that used to fetch it before
every tool call was deleted on 2026-10-01 (agentops 29689a5), so the daemon
held the speech until the page sent a new prompt.

## How it works

- Daemon: a listen request that finds speech already buffered (`barge`) answers
  with it at once, in order, joined with spaces, and does not ask the window to
  listen. An empty buffer behaves as before.
- Page: a listen that opens with speech the page still holds (`carry`, not yet
  handed to the daemon) sends it at once, unless Mark is mid-utterance, in which
  case the normal pause countdown runs and the rest is joined on.

## What it reads and writes

`src/stts-daemon.ts` (`/request`), `src/stts_ui.html` (`activateStt`). Test:
`test/buffered-speech-returns-at-once.test.mjs`; `test/long-speech-and-read.test.mjs`
now expects the buffered speech without the new answer.

## How to run, check, and hand over

`npm run build`, then `node --test test/*.test.mjs`. Cases covered: several
chunks buffered (returned once, in order, window not asked), speech that lands
during a tts turn, an empty buffer (listen waits as before).

| Behaviour | stts | callbot | Why |
| --- | --- | --- | --- |
| Buffered speech returned at once on listen | this spec | already (`listenFor` returns `s.heard` first, server.mjs) | none; same behaviour |
