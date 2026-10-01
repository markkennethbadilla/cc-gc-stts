# 039 - Pick the microphone

## What it does

The settings popover has a Mic list: "System default" (the Windows default
input, the default choice) plus every input device Chrome reports. The choice
is saved in the window's local storage like the voice and rate, and applies at
once without closing the window.

## Why it exists

Mark wants to choose which microphone the voice window listens to without
changing the Windows default.

## How it works

The daemon launches Chrome with `--use-fake-ui-for-media-stream`, which really grants the mic (the old `--auto-accept-camera-and-microphone-capture` left permission at "prompt", so Chrome hid every device and label and the list held only System default). In `src/stts_ui.html`, the list comes from `enumerateDevices()` (refreshed when the popover opens, on
`devicechange` and after the mic is granted, since names appear only then).
The saved `deviceId` goes into the echo-cancelled `getUserMedia` request from
spec 037 as `ideal`, so a device that was unplugged quietly falls back to the
default. Changing the pick stops the old track and asks for a new one; the
running recognizer restarts on it. The callbot gets audio from Meet, not a
local microphone, so this does not apply there (rule 67 checked).

## What it reads and writes

Reads the device list from Chrome. Writes `__stts__mic` in local storage
(empty means System default).

## How to run, check, and hand over

Open settings, pick a device, and the log shows "echo-cancelled mic ready"
with that device's settings. Check: `node --test test/`. Needs a window reload
to load this change.
