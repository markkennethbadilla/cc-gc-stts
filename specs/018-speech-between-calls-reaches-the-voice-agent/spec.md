# 018 - Speech between calls reaches the voice agent, exactly once

## What it does

Everything Mark says while the agent is silent and busy (running other tools
between stts calls) reaches the agent that is talking with him, once: through
the barge-in hook before one of its tool calls, or at the start of its next
`stt` or `tts` answer. No other agent can take it.

## Why it exists

Mark (2026-09-29): speech was lost while the agent worked between stts calls;
"how do they sign in" never reached the agent. The page and the daemon kept it,
but the house `stts-barge` hook runs before EVERY agent's tool calls on the
machine, background subagents and other sessions included, and each hook fetch
took the words. The agent in the voice loop hands work to background subagents
(house rule 66), so the words went to whichever subagent ran a tool first.
Found in the transcripts: a subagent of session `b1cb9279` was handed "It's
such a nice feature." as "The voice window heard this while you were working."

## How it works

- The hook (`mkb-agentops/.rulesync/hooks/stts-barge.mjs`, `bargeUrl`) asks
  `GET /barge?who=<session_id>|<agent_id>`. Claude Code puts `agent_id` in the
  hook input only inside a subagent, so the loop agent is `<session>|`.
- When the tool about to run is the stts `stt` or `tts` tool (plugin or gateway
  name, `/stts.*[_.](stt|tts)$/`), the hook adds `&owner=1`: that caller is the
  voice agent from then on.
- The daemon (`/barge` in `src/stts-daemon.ts`) keeps `voiceOwner`. A caller
  whose `who` is not the owner gets empty text and the words stay buffered. The
  owner takes them all. A caller with no `who` (an older hook) behaves as before.
- Anything the owner's hook does not take is still prepended to the next `stt`
  answer (spec 012), so a listen never misses it.

### Parity with the call bot

| Behavior | stts | callbot | Why they differ |
| --- | --- | --- | --- |
| Speech while the agent is busy between calls | Buffered; the voice agent gets it from the hook or the next `stt`/`tts` | Buffered in the session; returned whole on the next `call_listen` | The call bot has no barge-in hook; its buffer is per call session, so only the agent holding that session can read it |
| Who can take it | Only the agent whose hook last fired on an stts call | Only callers of that session id | Same outcome |

## What it reads and writes

- Reads the hook's `session_id` and `agent_id`. Writes nothing new; the owner
  lives in the daemon's memory and resets when the daemon restarts.

## How to run, check, and hand over

```
npm run build
node --test test/*.test.mjs
node <mkb-agentops>/.rulesync/hooks/stts-barge.mjs --self-check
```

`long-speech-and-read.test.mjs`, "only the voice owner takes speech said
between calls", three rounds: after the owner claims, a subagent and another
session get nothing, the owner gets the words once, and words left untaken
come back on the next listen. The hook self-check covers the `who`/`owner`
query for both payload dialects, subagents, and non-stts tools.

Known ceiling: the hook gives up on the daemon after 300 ms. If the daemon
answered in that instant the words are taken but not shown. Not seen; make the
fetch two-phase if it ever is.

Hand over: this spec, `voiceOwner` and `/barge` in `src/stts-daemon.ts`,
`bargeUrl` in the mkb-agentops hook.
