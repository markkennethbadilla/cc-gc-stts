# 035 - On-device mic, no error flashes

## What it does

The mic uses Chrome's on-device speech recognition for en-US when Chrome has
it (Chrome 139+), and the cloud recognizer otherwise. Routine recognizer ends
(`network`, `aborted`, `no-speech`) are logged to daemon.log but never shown
in the status line.

## Why it exists

Mark (2026-10-01): after the agent spoke, the status line showed "Error:
network" two or three times before listening worked, and his first words were
lost. daemon.log shows `network` errors in pairs about 3.8 s apart. They come
from Google's speech server ending the session; on-device recognition has no
server session to end.

## How it works

In the fork script block of `src/stts_ui.html`: on load,
`SpeechRecognition.available({langs:['en-US'], processLocally:true})` is
checked and logged. `available` turns on-device on; `downloadable` asks Chrome
to `install()` the pack and stays on cloud until it lands. `startMic` sets
`processLocally` on every start. A `language-not-supported` error from an
on-device session switches that recognizer back to cloud. Upstream's onerror
returns early for routine errors. Each mic start is logged (`mic start`,
with `(speaking)` if the agent was talking) so timing is visible.

## What it reads and writes

Reads Chrome's on-device availability. Writes log lines to daemon.log.

## How to run, check, and hand over

`node --test test/on-device-mic.test.mjs`. Live: grep daemon.log for
`on-device en-US:`; `available` means no more `network` errors should appear.
