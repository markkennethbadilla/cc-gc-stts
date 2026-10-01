# 026 A typed message stays in the voice loop

## What it does

When Mark types into the chat during a voice loop, the agent handles it, answers by voice, and listens again.

## Why it exists

Mark 2026-10-02: a typed message usually means he pasted something too long to say. Agents dropped out of the loop into text.

## How it works

The stt and tts tool descriptions (`NO_SLEEP_NOTE` in `src/stts-mcp-server.ts`), `skills/stts/SKILL.md` and `commands/stts.*` say: A message he types into the chat mid-loop (usually something too long to say) is a turn, not an exit: handle it, answer by voice, and go straight back to listening. Typing never ends the conversation. Only `__STTS_CONVERSATION_ENDED__` or an explicit request to end it stops the loop (spec 014).

## What it reads and writes

Tool descriptions and prompts only.

## How to run, check, and hand over

`npm test` (`test/typed-message.test.mjs` asserts the sentence is in each place).
