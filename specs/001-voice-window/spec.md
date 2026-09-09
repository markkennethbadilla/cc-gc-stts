# 001 - The voice window as it is

## What it does

One window, always the same one, that lets Mark talk to whichever agent
is running and hear it talk back. The agent calls two tools. `stt`
opens the Talk panel and returns what Mark said. `tts` reads text aloud
in the Listen panel and, with `listen` set, opens the Talk panel again
and returns the next thing he said, so one call serves one turn.

## Why it exists

Typing is the slow part of working with an agent. Upstream built the
loop for Claude Code and Gemini CLI; the fork makes it work on every
agent in the house, keeps the microphone hot, and stops speech from
being lost.

## How it works, in plain terms

- A small daemon on port 15986 owns the window. Any agent's tool call
  hands the daemon one request; the daemon shows it in the window and
  answers when Mark is done. One request at a time.
- The window is Edge in app mode with its own profile under
  `%LOCALAPPDATA%\cc-gc-stts\profile`. Settings and history live there
  and survive restarts, disk cleanup, and switching agents.
- The daemon and the page talk over one WebSocket. If a second copy of
  the page connects, the first shows "active in another window" and
  steps aside until clicked.
- Claude Code loads the fork as a plugin, which adds `/stts`.
  Antigravity imports the same plugin but turns its commands into
  skills. Codex, Grok, and OpenCode reach `stt` and `tts` through the
  MCP gateway, which runs the daemon from the pinned checkout.

## What the fork added, feature by feature

- **One always-on microphone.** Upstream started and stopped a
  recognizer per request and lost speech in between. The fork starts
  one recognizer and restarts it whenever Edge ends it. Speech heard
  while the agent is thinking or talking is carried into the next
  prompt.
- **Auto-send after a pause.** On by default, 2 seconds. Counts from
  the last interim result, so a sentence still being recognised is
  never cut. Turn it off to dictate long prompts.
- **Live interim text.** The prompt box shows Edge's interim transcript
  as Mark speaks and swaps it for the final. Edge settles an utterance
  late, so without this a short second sentence looked dropped.
  Successive finals get a space between them.
- **Barge-in with echo filter.** Off by default (speakers): the mic is
  muted while the agent talks. On (headset): talking over the agent
  stops it and what Mark said becomes the next prompt. The page
  compares what it hears with what it is saying so the agent's own
  voice is not taken as Mark.
- **Settings gear.** Voice, speaking rate 0.5x to 2x, auto-send and
  its pause, stop-on-silence, barge-in, all behind one button at the
  left of the end bar. Theme (system, light, dark) at the right.
- **Readable inactive panel.** The panel that is not active stays
  scrollable and selectable but read-only. Tab never moves focus out
  of the prompt box; a click on empty chrome never takes focus away.
- **Edge fallback.** Chrome when installed, else any Chromium, else
  Edge. A browser that refuses to start fails one request, not the
  daemon.
- **Bring to front on request, live-process check.** A request raises
  the window; a dead browser process is relaunched instead of trusted.
- **No service worker.** The reverted PWA experiment left one
  registered; the page unregisters it so a cached page can never shadow
  a newer build.

## Voice commands

Talk panel: insert comma, insert period, insert question mark, insert
exclamation mark, insert tab, new paragraph, go to start, go to end,
cancel prompt, send prompt, end conversation, select all, unselect
selection, delete selection, undo it, redo it.

Listen panel: play it, stop it, got it.

## Known limits

- Edge's recognizer runs through Microsoft's speech service; no
  network, no recognition.
- One request at a time. A second agent calling while one is pending
  gets `busy`.
- History and settings are per machine.
