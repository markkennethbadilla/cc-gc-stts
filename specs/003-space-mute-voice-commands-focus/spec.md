# 003 - Space to mute, three more voice commands, and no focus stealing

## What it does

- **Space mutes and unmutes the microphone.** Anywhere in the window.
  If the prompt box has focus, the space is typed as well, so
  dictation and typing are not disturbed. The mic button shows the
  state, and the window title carries "(muted)" so it is visible from
  the taskbar.
- **Three Listen-panel voice commands.** "repeat" reads the last answer
  again. "slower" and "faster" move the speaking rate one step
  (0.1x) and persist it, the same setting as the slider. "skip" was
  considered and dropped (Mark 2026-09-09); "pause" was dropped because
  "wait" in normal speech would trigger it.
- **The window no longer jumps to the front.** Bring-to-front on every
  request becomes a setting, "Raise window on request", off by
  default. The window still opens on the first request when it did not
  exist.

## Why

Mark reaches for the keyboard to mute when someone walks in; a click
target is slower than a key. Repeat and rate by voice keep the hands
free during a long answer. Focus stealing interrupted whatever he was
typing elsewhere on every turn.

## How it works

- Space: a keydown listener on the document toggles a `muted` flag.
  Muting aborts the recognizer and marks it paused, the same path used
  when the agent talks with barge-in off; unmuting starts it again.
  The default action of the key is not prevented, so the textarea
  still receives the space.
- Voice commands: added to the Listen panel's command matcher next to
  play it, stop it, got it. "repeat" calls the existing play path.
  "slower" and "faster" adjust the stored rate and update the slider.
- Raise on request: the daemon reads the setting from the page over the
  existing WebSocket (`settings` message on connect and on change) and
  only calls bring-to-front when it is on. A window that is not yet
  open is still created.
