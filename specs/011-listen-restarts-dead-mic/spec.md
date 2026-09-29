# 011 - A listen never waits on a dead microphone

## What it does

While the voice window is waiting for Mark to speak, it checks every two
seconds that the browser's speech recognizer is really alive. If it is not, the
window restarts it and writes one line to `daemon.log` saying why. Every
recognizer error (other than the window's own deliberate stops) is written
there too.

## Why it exists

On 2026-09-28 it happened five times in one session: the window showed the
microphone as listening, Mark talked, nothing was written down, and the listen
ran to its four-minute limit (spec 007). He had to type instead. Closing the
window and opening a new one fixed it at once, so the microphone itself was
fine; the page's recognizer had stopped and nothing brought it back.

The recognizer in Edge and Chrome is known to stop without any error or end
signal (web-speech-api issue 96; Stack Overflow 38702797), and the browser
sometimes never reports that a spoken reply has finished (Stack Overflow
54861046). The window turns the microphone off while the agent speaks and back
on when the reply finishes, so a lost "finished" left the microphone switched
off for good. The older 90-second check (spec 005) skipped exactly that case,
and it only looked for any event at all, which a recognizer that keeps cycling
without hearing anything still produces.

## How it works

All in `src/stts_ui.html`, inside the one-microphone block.

- The page tracks the recognizer's real state from its own events: running
  after `start`, stopped after `end`, and the last time it had audio
  (`audiostart`) or wrote words (`result`).
- While a listen is waiting (Talk mode is `stt`), not paused with Space, not
  speaking, and "stop listening on silence" is off, a check runs every two
  seconds (`micVerdict`). It restarts the recognizer when:
  - it has not been running for 6 seconds (the normal restart after `end`
    gets that long, including its backoff, to do the job first);
  - it heard speech but wrote no words for 8 seconds;
  - it had no audio and no words for 15 seconds.
- A restart clears a leftover "agent is speaking" pause, aborts the
  recognizer and starts it again 300 milliseconds later.
- When an error keeps ending the recognizer (for example `network`), the
  normal restart after `end` restarts at once, and waits longer only when
  errors come less than 10 s apart, up to 2 seconds (spec 019). The first word
  it writes resets that.
- The microphone icon and "Listening" state already follow the recognizer's
  own `start` and `end` events, so once it is restarted they are accurate
  again.
- The page sends `{ type: 'log', text }` over its socket; the daemon
  (`src/stts-daemon.ts`) writes it to `daemon.log` with a timestamp.

The idle exit (spec 010) is unchanged: a listen that hears nothing still hands
the turn back after 20 seconds, and the mic stays live.

## What it reads and writes

- Reads the recognizer's events. Writes restart and error lines to
  `%LOCALAPPDATA%/cc-gc-stts/daemon.log` (no speech content, only the reason).

## How to run, check, and hand over

```
npm run build
node --test test/*.test.mjs
```

`test/mic-restart.test.mjs` lifts `micVerdict` out of the real page and checks:
a healthy listen is left alone; a recognizer that ended mid-listen is restarted
after its grace period; a wedged one with no audio for 15 seconds is restarted;
speech with no words for 8 seconds is restarted; nothing happens outside a
listen, while paused, while the agent speaks, or with stop-on-silence. It also
checks that restarts are logged, clear a stale pause, that errors widen the
restart delay, and that the daemon writes page log lines.

Checked live on 2026-09-28 in a throwaway headless Edge with a fake
microphone: a recognizer stopped mid-listen, and one left paused as if a reply
never finished, were both restarted and logged within about ten seconds.

Live check, for Mark: during a listen, if the mic ever goes deaf again, it
should come back within about 15 seconds on its own. `daemon.log` then shows a
`page mic restart` line with the reason.

Hand over: this spec, `src/stts_ui.html`, `src/stts-daemon.ts`,
`test/mic-restart.test.mjs`.
