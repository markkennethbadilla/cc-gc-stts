# 016 - No voice commands; talking over the voice stops it

## What it does

No word Mark says is a command to the voice window. Every word is transcript
for the agent. The agent decides whether he meant repeat, slower, send, or
nothing at all, and acts through its own tool calls. The one thing speech does
by itself: talking over the agent's voice stops it, the way a person stops when
interrupted (Mark 2026-09-29).

- The Talk panel's spoken commands are gone ("send prompt", "cancel prompt",
  "insert comma", "new paragraph", "select all", "undo it" and the rest).
- The Listen panel's spoken commands are gone ("play it", "stop it", "got it",
  "repeat", "slower", "faster"), including while the agent works.
- Talking over the agent in headphone mode stops the voice at once. The page
  sends his words to the daemon as `heard`, then stops playback; a pending
  `tts` returns with `__STTS_HEARD__ <words>`, and the MCP server turns that
  into a plain reply: "He spoke while you were speaking: ... Your voice stopped
  during part N of M." The agent answers it, or, if the words were not for it
  (a TV, someone else in the room), calls `tts` again from the part the reply
  names.
- What counts as talking over: a final transcript with two or more content
  words (fillers such as "yeah", "okay", "mm-hmm", "right" do not count) that
  is not mostly the agent's own text. So a backchannel or the agent's voice
  coming back through the mic does not stop it.
- The buttons stay: Stop, Play, Got it, the mic button, and End conversation are
  presses, not voice.

## Why it exists

Mark (2026-09-29): "There should be no voice controlled controls. It should be
you invoking those controls, if you felt like I meant those." The mic is always
on (spec 005, 012), so a TV, a phone call, or a sentence that happens to hold
"stop it" or "send prompt" acted on the window without him meaning it. Spec 014
already removed the spoken "end conversation" for this reason.

Later the same day he asked for the voice to stop when he talks over it, by
default, in stts and in the WeAssist call bot alike (house rule 67): waiting
for the agent's next call left the voice talking over him.

## How it works

- `extractCommands` (Talk) returns the text unchanged; `extractTtsCommands`
  (Listen) returns no effects. The command regexes, the spec 003 additions and
  the idle "repeat" path are deleted, and the cheat-sheet buttons are hidden.
- Headphone mode, while the agent speaks: `isEcho` drops a final with fewer
  than two content words, or one mostly made of the spoken text. Any other
  final is sent as `{ type: 'heard', text }`, then `stopSpeaking()` and
  `resetToIdle()` run, the same as a Stop press minus the `stopped` message.
  `heard` goes first so the daemon returns the words, not a plain stop.
- The daemon resolves a pending `tts` with `__STTS_HEARD__ <text>`; with nothing
  pending it keeps the words like any other speech between tool calls, for the
  next listen or the barge-in hook.
- The MCP `tts` stops going through parts when it sees the marker, does not
  open a listen (he has already spoken), and names the part to resume at.
- With speakers (headphone mode off) the mic is off while the agent speaks, so
  there is no talking over it; nothing changed there.

### Parity with the call bot

| Behavior | stts (this spec) | callbot (its spec 004) | Why they differ |
| --- | --- | --- | --- |
| Spoken commands | None | None | Same |
| Someone talks over the voice | Stops at once; `tts` returns his words and the part to resume at | Stops at once; the words come back on the listen the agent holds, with the part to resume at | `call_say` returns after part 1, so that agent is already listening |
| What counts | Two or more content words, not an echo | The same list and bar | Same |
| Short line ("yeah", one word) | Treated as echo, dropped | Kept, reaches the agent, she keeps talking | Nothing said in a meeting is dropped (callbot spec 003) |
| Stop | Stop button, or the agent's next call | `call_say` `stop: true` | No page button in a meeting |

## What it reads and writes

- Reads nothing new. Writes nothing.

## How to run, check, and hand over

```
npm run build
node --test test/*.test.mjs
```

Tests: talking over a `tts` returns his words in under a second, says the voice
stopped, and opens no listen, three times over; talking over part 2 of a file
names part 2; `isEcho` lets "hang on a second" through and holds back "yeah",
"mm-hmm", "stop" and pieces of the spoken text, three rounds; `heard` with
nothing pending reaches the next listen and an empty one is ignored; no
`COMMAND_REGEX` remains; the page sends `heard` then stops the voice.

Not tested live: with headphone mode on, talk over a long reply; the voice
should stop within about a second of Edge finalising the words.

Hand over: this spec, `HEARD` in `src/protocol.ts`, `case 'heard'` in
`src/stts-daemon.ts`, the talk-over branch and `isEcho` in `src/stts_ui.html`,
and the `tts` tool in `src/stts-mcp-server.ts`.
