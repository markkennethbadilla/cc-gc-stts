# 031 - The voice window runs in Chrome, never Edge

## What it does

The voice window opens as a Chrome app window
(`C:\Program Files\Google\Chrome\Application\chrome.exe`, its own profile
under `%LOCALAPPDATA%\cc-gc-stts\profile`). Speech recognition is Chrome's
`webkitSpeechRecognition`. Replies are read with **Google US English** by
default; a voice picked in the Voice menu still wins.

## Why it exists

Mark removed Edge from the laptop on 2026-10-01 and a house hook bans
launching or installing it. The daemon looked for the Edge executable first,
so the window had to move to Chrome.

## How it works

- `resolveBrowserPath` checks `CHROME_PATH`, then Chrome under Program Files
  (64-bit, then x86), then chrome-launcher's own search. Edge paths are gone.
- The isolated profile directory is unchanged, so saved settings and history
  carry over.
- Default voice: `Google US English`, else the first `en-US` voice, else any
  English voice. Why Google US English: Chrome does not expose Edge's Microsoft
  Natural voices; its local choices are the Windows SAPI voices (David, Zira,
  Mark), which sound robotic. Google US English is the most natural voice
  Chrome has, but it is a network voice: it needs internet and sends the text
  to Google. Offline it does not appear and the local en-US voice is used.
- Replies are already spoken one sentence per utterance (spec 022), which
  also stays under Chrome's known cut-off of long Google-voice utterances.

## What it reads and writes

Reads the Chrome executable path. Writes the Chrome profile under
`%LOCALAPPDATA%\cc-gc-stts\profile` (as before).

## How to run, check, and hand over

`npm run build`, then call the `tts` tool: a Chrome app window opens and speaks
the text. Call `stt` and speak: the transcript comes back. To use another
browser build, set `CHROME_PATH`.
