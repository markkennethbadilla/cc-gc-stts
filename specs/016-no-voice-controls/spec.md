# 016 - No voice commands; talking over the voice does not stop it

## What it does

No word Mark says is a command to the voice window. Every word is transcript
for the agent. The agent decides whether he meant repeat, slower, send, or
nothing at all, and acts through its own tool calls. Talking over the agent's
voice does not stop it either: the voice finishes what it is saying
(Mark 2026-09-30).

- The Talk panel's spoken commands are gone ("send prompt", "cancel prompt",
  "insert comma", "new paragraph", "select all", "undo it" and the rest).
- The Listen panel's spoken commands are gone ("play it", "stop it", "got it",
  "repeat", "slower", "faster"), including while the agent works.
- Talking over the agent in headphone mode: the voice keeps going to the end.
  His words, short or long, are kept (spec 019) and reach the agent with the
  next prompt, or as a barge-in after his pause once the agent is working.
- Only a press stops the voice: the Stop button, or the agent's own next call.
- The buttons stay: Stop, Play, Got it, the mic button, and End conversation are
  presses, not voice.

## Why it exists

Mark (2026-09-29): "There should be no voice controlled controls. It should be
you invoking those controls, if you felt like I meant those." The mic is always
on (spec 005, 012), so a TV, a phone call, or a sentence that happens to hold
"stop it" or "send prompt" acted on the window without him meaning it. Spec 014
already removed the spoken "end conversation" for this reason.

Mark (2026-09-30, in a call): "fix that you don't stop talking when someone's
speaking, so that you get to finish yourself." Stopping on every line said over
the voice cut replies in half. The same change landed in the WeAssist call bot
(its spec 004) under house rule 67.

## How it works

- `extractCommands` (Talk) returns the text unchanged; `extractTtsCommands`
  (Listen) returns no effects. The command regexes, the spec 003 additions and
  the idle "repeat" path are deleted, and the cheat-sheet buttons are hidden.
- Headphone mode, while the agent speaks: `ownVoice` drops text mostly made of
  the spoken text. Every other final goes to `carry` (spec 019); nothing in that
  branch stops the voice or ends the `tts` call. After the voice ends, `carry`
  opens the next prompt, or is sent to the daemon as a barge-in after his pause.
- The old talk-over path (`isEcho`, the page's `heard` message, the daemon's
  `__STTS_HEARD__` reply, and the `tts` tool's "He spoke while you were
  speaking") is deleted.
- With speakers (headphone mode off) the mic is off while the agent speaks, so
  there is no talking over it; nothing changed there.

### Parity with the call bot

| Behavior | stts (this spec) | callbot (its spec 004) | Why they differ |
| --- | --- | --- | --- |
| Spoken commands | None | None | Same |
| Someone talks over the voice | It finishes; his words are kept for the next prompt, or reach the agent as a barge-in after his pause | She finishes; the words come back on the listen the agent holds, with `OVER_HER` | `call_say` returns after part 1, so that agent is already listening; stts has no listen open during its own voice |
| Short line ("yeah", one word) | Kept, same as any line | Kept, same as any line | Same |
| Its own voice heard back | Dropped (`ownVoice`) | Long echo dropped, short piece kept with the note | Recall transcribes her too; Edge speech only picks up the room |
| Stop | Stop button, or the agent's next call | `call_say` `stop: true` | No page button in a meeting |

## What it reads and writes

- Reads nothing new. Writes nothing.

## How to run, check, and hand over

```
npm run build
node --test test/*.test.mjs
```

Tests: the `tts` branch of the page's result handler keeps every final in
`carry` and holds no `stopSpeaking`, `synth.cancel`, `resetToIdle`, `heard` or
`isEcho`; the daemon has no `heard` case; the stop button still sends
`stopped`; no `COMMAND_REGEX` remains. Run three times, all green.

Not tested live: with headphone mode on, talk over a long reply; the voice
should finish, and the words should open the next prompt.

Hand over: this spec, the `tts` branch and `ownVoice` in `src/stts_ui.html`,
and `STOPPED` in `src/protocol.ts`.
