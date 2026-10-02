# 042 - Speech is heard only while a listen is open

## What it does

Only what Mark says while the agent is actually listening (an open `stt`, or the
listen half of `tts` with `listen`) reaches the agent. Speech while the agent is
working or speaking is not kept and is never returned later. The window shows
which state it is in, so he knows when to talk.

How he knows it is listening:

- **Listening:** the Talk panel is lit (not grey) and its status says Listening.
  His words appear in the prompt box as he speaks.
- **Not listening:** both panels are grey and the status reads "Not listening.
  Wait for the agent, then speak." Nothing he says shows in the box. If he said
  something then, he says it again once the panel lights up.

## Why it exists

Mark, 2026-10-03: speech said while the agent was busy was queued and returned
on a later listen, so it got answered two responses late and caused
miscommunication. He wants the agent to hear only what it can act on now.

## How it works

- Page (`src/stts_ui.html`): the result handler keeps speech only in `stt` mode.
  In `tts` and idle modes it discards results. Going idle clears the box and sets
  the Not listening status. The page never sends `barge`.
- Daemon (`src/stts-daemon.ts`): no speech buffer. A `complete` with no listen
  open is dropped; `nospeech` always answers `__STTS_NO_SPEECH__`. `GET /barge`
  only reports whether the window is open (`text` is always empty).
- Kept: speech said during an open listen that the daemon released at its time
  limit (spec 012) is still carried into the very next listen, because it was
  said while listening.

## What it reads and writes

`src/stts_ui.html`, `src/stts-daemon.ts`. Tests:
`test/page-keeps-speech.test.mjs`, `test/long-speech-and-read.test.mjs`,
`test/no-speech-idle.test.mjs`.

## How to run, check, and hand over

`npm run build`, then `node --test test/*.test.mjs`. Covered: speech with no
listen open is dropped three rounds in a row and the next listen returns only new
speech; a silent listen answers the no-speech marker; the page has no
keep-or-send path outside `stt` mode and shows the Not listening text.

| Behaviour | stts | callbot | Why |
| --- | --- | --- | --- |
| Speech outside an open listen | Dropped | Buffered and returned on the next `call_listen` | A meeting has other people talking to each other; the bot needs the whole conversation to judge what was meant for it, and nobody can be told to repeat. Mark's request was for his own voice loop. |
