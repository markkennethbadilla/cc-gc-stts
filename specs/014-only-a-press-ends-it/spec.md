# 014 - Only a real press of End conversation ends it

## What it does

The conversation ends only when Mark himself presses the End conversation
button. Nothing he says can end it, and no script can click the button for
him. Between tool calls the window stays open and keeps listening for as long
as the agent is away. It has no idle limit.

## Why it exists

On 2026-09-29 Mark tested spec 012 twice by talking during a 12-second pause
between tool calls. Both times the listen came back as
`__STTS_CONVERSATION_ENDED__`, and the window and the daemon shut down. He had
not pressed anything.

The evidence:

- The daemon log shows `daemon exit ... code 0` at 16:02:01.715Z and
  16:03:19.147Z (UTC). Each exit came 0.4 s after the agent got the marker. A clean
  exit happens only on `/api/shutdown`. Only the End conversation handler
  posts that, and it is also the only place that sends `ended`.
- That handler ran from one of two places: a real click, or the spoken command
  `end conversation`. The spoken command did
  `document.getElementById('end-btn').click()` (stts_ui.html, the
  `match[18]` branch of `extractCommands`).
- Voice commands are read from the whole prompt box 500 ms after every change,
  interim guesses included. Since spec 012 the mic stays on between tool calls,
  so everything Mark says while testing lands in that box. If the words "end
  conversation" appear together anywhere in it, it ends the conversation.
  Talking about whether the conversation will end is exactly what produces
  those words.
- `test/window-stays-open.live.mjs` reproduces it. On the old page, typing
  "so let us see if this will end conversation now" into the box with no
  request pending shut the daemon down within 6 s (`daemon exit ... code 0`),
  and the next listen was refused.

Ending the conversation cannot be undone, so it must never come from a guess of
the speech recognizer.

## How it works

- The `end conversation` voice command is removed from `COMMAND_REGEX`, from
  `extractCommands`, and from the commands panel.
- The End conversation handler returns at once unless `event.isTrusted`, so
  only a real mouse press or key press on the button ends the conversation.
  A script click, from any future code path, is ignored.
- Nothing else changes. The daemon has no idle timeout between requests, and the
  page's idle timer (spec 010) only runs during a listen. It answers
  `__STTS_NO_SPEECH__` and never ends the conversation.

## What it reads and writes

- It reads and writes nothing new.
- The live test runs its own daemon on `STTS_TEST_PORT` (default 15990), with a
  throwaway browser profile under `%TEMP%`.

## How to run, check, and hand over

```
node build.mjs
node --test test/*.test.mjs
node test/window-stays-open.live.mjs 15 15 15
node test/window-stays-open.live.mjs 120 120 120
```

The unit tests check that the handler ignores a click it did not get from
Mark, that no voice command matches "end conversation", and that nothing in
the page clicks the button. The live test opens the real window and speaks
"Gap test." Then it puts "end conversation" into the box with no request
pending, waits for the gap, and listens. It passes when the listen returns
something other than the marker and the daemon and the window are both still
up.

To check by hand, say "end conversation" out loud during a listen. The words
go to the agent as text, and the window stays open.

Hand over: this spec, `src/stts_ui.html`, `test/conversation-ended.test.mjs`,
`test/window-stays-open.live.mjs`.
