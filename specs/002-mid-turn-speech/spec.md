# 002 - Speaking while the agent works

## What is wrong

While an agent runs tools, nobody reads the daemon. Whatever Mark says
is kept and shows up as the start of the next prompt, minutes later, as
if it were a new task. And when a message does reach a working agent,
typed or spoken, every agent treats it as "stop": it answers, ends its
turn, and asks whether to continue. Mark's words (2026-09-09): "I just
wanted to add stuff, or ask for an update. I don't want you to stop."

## What it does

Mark can talk while an agent works. After his usual pause (the
auto-send setting, 2 seconds by default) what he said reaches the agent
at its next tool call, marked as a barge-in, with the instruction to
keep going unless the words say otherwise. A request for an update gets
the update and the work continues.

## How it works

1. **The page** captures speech in every mode already. When the agent
   is neither listening nor talking (idle), a final utterance followed
   by the auto-send pause is sent to the daemon as a `barge` message
   instead of being held for the next prompt. While the agent is
   talking with barge-in on, the existing stop-and-return path is
   unchanged.
2. **The daemon** keeps a short queue of barge-ins and serves them on
   `GET /barge`, which returns the queued text and empties the queue.
   Nothing is discarded: text nobody fetched within a turn is still
   prepended to the next `stt` result, as today.
3. **The hook** `stts-barge.mjs` in `mkb-agentops` runs before every
   tool call on every agent. It asks `GET /barge` with a 300 ms
   timeout; if the daemon is down or quiet it prints nothing. If there
   is text, it adds context to the agent:

   > Mark said this while you were working, through the voice window.
   > It is an addition, not a stop. Answer it in a line or two and keep
   > doing what you were doing, unless it says stop, wait, or gives a
   > new direction: "<text>"

4. **The rule** in `mkb-agentops` `overview.md` (rule 47) says the same
   for every mid-turn message, typed or spoken, on every agent, so the
   instruction is policy first and reminder second.

## What it does not do

- It does not interrupt a tool that is already running. The barge-in
  lands at the next tool boundary, usually seconds.
- It does not speak the agent's reply on its own. The agent decides
  whether to answer by voice (a `tts` call without `listen`) or in
  text; the skill says one or two spoken sentences.
- It is not multi-agent. One agent at a time (constitution I).

## How to tell it works

Start a long task by voice. Say "give me an update" and pause. Within
the next tool call the agent speaks a one-line update and the task
continues without a "should I continue?" question.
