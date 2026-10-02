# 004 - The window closes when the conversation ends, and looks live while the agent works

## What it does

- **Close on done.** The `tts` tool takes a `close` flag. The agent sets
  it on the last message of a voice conversation ("Okay, done"), and the
  window closes after it is spoken. The daemon stays up so the next
  call is fast. `End conversation` in the window already closed
  everything; it still does.
- **The Talk panel says Not listening while the agent works.** Both
  panels are grey between requests and the status reads "Not listening.
  Wait for the agent, then speak." Nothing said then reaches the agent
  (spec 042). The Listen panel stays grey until the agent
  talks.

## Why

Mark (2026-09-09): "the agent should close the window when we're done
speaking", and "whenever it's active it should look active, not greyed
out, and show that it's transcribing me live". A grey panel with a hot
mic told him nothing was listening when everything was.

## How it works

- `close` travels in the request config; the daemon kills the browser
  200 ms after answering a request that carries it. `listen` and
  `close` are exclusive: a call with both keeps the window.
- The page wraps upstream's `resetToIdle` and, after it, re-enables the
  Talk panel, its buttons, and its status line. The idle branch of the
  transcript router writes interim text and finals into the prompt
  box, using the same provisional-tail mechanism as the Talk mode.
- The skill's loop ends with `tts` text "Done." and `close: true`.
