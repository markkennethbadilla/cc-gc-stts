# 016 - No voice controls; the agent holds the controls

## What it does

Nothing Mark says makes the voice window do anything by itself. Every word is
transcript for the agent. The agent decides whether he meant stop, repeat,
slower, send, or nothing at all, and acts through its own tool calls.

- The Talk panel's spoken commands are gone ("send prompt", "cancel prompt",
  "insert comma", "new paragraph", "select all", "undo it" and the rest).
- The Listen panel's spoken commands are gone ("play it", "stop it", "got it",
  "repeat", "slower", "faster"), including while the agent works.
- Talking over the agent in headphone mode no longer cuts the voice. The page
  sends his words to the daemon as `heard`; a pending `tts` returns at once with
  `__STTS_HEARD__ <words>`, and the MCP server turns that into a plain reply:
  "He spoke while you were speaking: ... Your voice is still playing until your
  next stts call." The agent answers (its next `tts` or `stt` cuts the
  playback) or, if the words were not for it, calls `tts` again to go on from
  the part the reply names.
- The buttons stay: Stop, Play, Got it, the mic button, and End conversation are
  presses, not voice.

## Why it exists

Mark (2026-09-29): "There should be no voice controlled controls. It should be
you invoking those controls, if you felt like I meant those." The mic is always
on (spec 005, 012), so a TV, a phone call, or a sentence that happens to hold
"stop it" or "send prompt" acted on the window without him meaning it. Spec 014
already removed the spoken "end conversation" for this reason.

## How it works

- `extractCommands` (Talk) returns the text unchanged; `extractTtsCommands`
  (Listen) returns no effects. The command regexes, the spec 003 additions and
  the idle "repeat" path are deleted, and the cheat-sheet buttons are hidden.
- Headphone mode, while the agent speaks: each final transcript is sent as
  `{ type: 'heard', text }`. The daemon resolves a pending `tts` with
  `__STTS_HEARD__ <text>`; with nothing pending it keeps the words like any
  other speech between tool calls, for the next listen or the barge-in hook.
- The MCP `tts` stops going through parts when it sees the marker and does not
  open a listen: he has already spoken. The agent decides within about a second.
- With speakers (headphone mode off) the mic is off while the agent speaks, so
  there is no talking over it; nothing changed there.

## What it reads and writes

- Reads nothing new. Writes nothing.

## How to run, check, and hand over

```
npm run build
node --test test/*.test.mjs
```

Tests: talking over a `tts` returns his words in under a second and opens no
listen, three times over; talking over part 2 of a file names part 2; `heard`
with nothing pending reaches the next listen and an empty one is ignored; no
`COMMAND_REGEX` remains; the page sends `heard` and the daemon handles it.

Hand over: this spec, `HEARD` in `src/protocol.ts`, `case 'heard'` in
`src/stts-daemon.ts`, the talk-over branch in `src/stts_ui.html`, and the `tts`
tool in `src/stts-mcp-server.ts`.
