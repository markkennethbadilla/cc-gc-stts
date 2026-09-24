# 008 - End conversation says so, instead of arriving as silence

## What it does

Gives the End conversation button its own message and its own reply, so an agent
can tell "he ended the conversation" from every other way a turn can end. The
reply is the marker `__STTS_CONVERSATION_ENDED__`, and the button's message is
`ended`.

## Why it exists

Every way a turn could end used to arrive at the agent as the same empty string.
The button sent the ordinary tts `close` (which also means "the turn finished")
or the stt `cancel` (which also means "the prompt was abandoned"), and the reply
was `''` in both cases, indistinguishable from a transcript that was empty for
any other reason.

Mark, 2026-09-24, after a session where the agent kept calling the tools back:
*"u dont know when i pressed end conversation … there must be a better indicator."*

An empty reply is not an indicator. It cannot be: three different events produce
it, and the agent's only available move is to guess. And the guess has a visible
cost — the loop's old advice was to answer an empty reply with `tts` "Done." and
`close: true`, which **re-opens the window he just closed**, so ending the
conversation summoned it back.

## How it works

- **The page** (`stts_ui.html`) sends `{ type: 'ended' }` from the End
  conversation handler, in place of the `close` or `cancel` it used to send. It
  still posts `/api/shutdown` and blanks itself afterwards.
- **The daemon** (`stts-daemon.ts`) answers that message by resolving the pending
  request with `CONVERSATION_ENDED`, rather than `''`.
- **The marker** is defined once, in `src/protocol.ts`, and imported by both the
  daemon that produces it and the MCP server that explains it. Two copies of the
  string would eventually become two different strings, and the indicator would
  quietly go back to being silence.
- **The MCP server** (`stts-mcp-server.ts`) appends the meaning to both tool
  descriptions, so every agent reads it every session, whatever it does with
  skills: the reply means he ended it, the window is already shut down, so speak
  nothing, call neither tool again, and stop.

The string is `__STTS_CONVERSATION_ENDED__`: ASCII, no spaces, wrapped in
underscores, so no transcript and no misheard word can be mistaken for it.

Together with spec 007 this closes the ambiguity from both sides: an unanswered
request now reports an error (504), and the only reply that means "he ended it"
is the marker. Silence no longer carries any meaning at all.

## What it reads and writes

- `STTS_PORT` — optional, on the daemon only. Lets a test run a daemon of its own
  instead of taking the fixed port from the one serving the agent.
- It writes nothing.

## How to run, check, and hand over

```
npm run build
node --test test/conversation-ended.test.mjs test/request-timeout.test.mjs test/echo.test.mjs
```

The conversation-ended test lifts the real button handler out of `stts_ui.html`,
the way the echo test does, and asserts it sends `ended` and no longer sends
`close` or `cancel`; it also asserts the daemon answers `ended` with the marker
rather than an empty string, and that the marker is one ASCII definition.

Live check, which only Mark can make: start a conversation, and while a request is
waiting press End conversation. The agent must receive the marker, and its reply
must be nothing new — no `tts` call, and the window must not come back.

Hand over: this spec, `src/protocol.ts`, `src/stts_ui.html`, `src/stts-daemon.ts`,
`src/stts-mcp-server.ts`, `test/conversation-ended.test.mjs`.
