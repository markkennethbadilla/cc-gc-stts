# 028 - Do not say the same thing twice

## What it does

If the agent's answer to what Mark just said would only repeat its own last
reply, the agent says nothing and listens again. Example: the agent confirms
"yes, that is it", then Mark says "and I think that's it, right". The agent
does not confirm a second time; it keeps listening.

## Why it exists

Live on 2026-09-30 the agent answered a confirmation with the confirmation it
had just given. Hearing the same words twice wastes Mark's time on a slow
voice channel (Mark 2026-09-30).

## How it works

One sentence in the agent instructions, next to the existing "a repeated
transcript was already answered, listen again silently" rule: in the `stt`
and `tts` tool descriptions (`src/stts-mcp-server.ts`), `commands/stts.md`
and `commands/stts.toml`. No code path changes; the agent decides.

## What it reads and writes

Nothing new. Tool descriptions and the slash command text only.

## How to run, check, and hand over

`npm run build`, then `node --test test/`. The test
`speech-not-split.test.mjs` asserts the sentence in all three places.

| Parity with callbot (rule 67) | stts | callbot |
| --- | --- | --- |
| Repeat-reply is not spoken | this spec | `UNFINISHED` in `server.mjs`, callbot spec 009 |
