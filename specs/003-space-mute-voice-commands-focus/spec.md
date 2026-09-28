# 003 - Space to mute, and no focus stealing

## What it does

- **Space mutes and unmutes the microphone.** Anywhere in the window.
  If the prompt box has focus, the space is typed as well, so
  dictation and typing are not disturbed. The mic button shows the
  state, and the window title carries "(muted)" so it is visible from
  the taskbar.
- **The window no longer jumps to the front.** Bring-to-front on every
  request becomes a setting, "Raise window on request", off by
  default. The window still opens on the first request when it did not
  exist.

## Why

Mark reaches for the keyboard to mute when someone walks in; a click
target is slower than a key. Focus stealing interrupted whatever he was
typing elsewhere on every turn.

## How it works

- Space: a keydown listener on the document toggles a `muted` flag.
  Muting aborts the recognizer and marks it paused, the same path used
  when the agent talks with barge-in off; unmuting starts it again.
  The default action of the key is not prevented, so the textarea
  still receives the space.
- Raise on request: the daemon reads the setting from the page over the
  existing WebSocket (`settings` message on connect and on change) and
  only calls bring-to-front when it is on. A window that is not yet
  open is still created.
