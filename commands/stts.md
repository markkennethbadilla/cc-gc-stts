---
name: stts
description: User speaks the prompt, which is sent to the Model, the received response is spoken/read aloud in a loop.
---

Call the stt MCP tool once and read its response. It is one of five things, and each has its own move:

- Exactly `__STTS_LISTEN_CONTINUES__`: the listen hit the tool-call time limit, usually because he is still talking. Nothing is lost: call stt again at once, silently, and it returns all of it.
- Exactly `__STTS_CONVERSATION_ENDED__`: he pressed End conversation and the window is already gone. Speak nothing, call no tool, stop.
- Exactly `__STTS_NO_SPEECH__`: he has not spoken yet, and the window is still listening. If a background result you promised him has landed, speak it through tts with listen true. Otherwise call stt again, silently. This is never the end of the conversation.
- Empty: the prompt was cancelled. Call the tts tool with the text 'Done.' and close set to true, which speaks it and closes the voice window, then stop.
- Anything else is his prompt. A turn can arrive mid-thought: if the transcript reads unfinished (trails off, ends on a connector like 'and', 'so', 'but', 'like', or an incomplete clause), do not answer; listen again with idleSec 1 and join the pieces. If that short listen returns __STTS_NO_SPEECH__, he has finished: answer what you have. Answer only when the thought is complete enough. If a transcript repeats something you already answered, it is the same speech delivered late: do not answer it again; listen again silently. If your answer would only repeat what you said in your last reply (he confirms something you already confirmed), do not speak at all: listen again silently. Answer it, and pass that answer to the tts MCP tool with listen set to true: it speaks the answer, then listens and returns the next thing he said, so one tool call serves each turn.

Treat every tts listen return exactly like an stt response and repeat. While the loop is running, do not output anything else to the user. Never sleep or block on another tool to wait for him: to wait, call stt again (its default idleSec, 200 seconds, is already the longest), so you answer the moment he stops talking. Use the default idleSec for every normal wait: a background result arrives on its own and interrupts the listen. The one exception: a listen made only because a turn reads unfinished passes idleSec 1. A message he types into the chat mid-loop (usually something too long to say) is a turn, not an exit: handle it, answer by voice, and go straight back to listening. Typing never ends the conversation. Hand any long work to a background subagent and keep listening.

Nothing he says controls the window; you hold the controls. Talking over your voice does not stop it: it finishes, and his words come back on the next listen. Act on them if they were meant for you (including repeat, slower, go on).

Speak before you work, and speak at the end. If answering the prompt needs any tool call, first pass one short sentence to the tts tool with listen false, saying what you are about to do, then start. Silence while tools run reads as a hang. During the work, speak only at three moments, each one sentence with listen false: you hit a wall that needs the user (a code on their phone, an irreversible action), the plan changed from what they would expect, or the quiet is about to pass two minutes, in which case name the phase you are in. Never narrate individual tool calls or partial results; the user cares about the end result, and a running commentary is noise. The final answer always goes to tts with listen true, as above.

To read out something that already exists (a story, a chapter, notes, a document), pass its path as file (or a plain-text url) to tts instead of copying it into text. If the reply names a part to go on from, call tts again with that part.

Text passed to the tts tool is spoken aloud, not read. Compose it in plain, natural, conversational sentences regardless of any active text-compression style (e.g. caveman mode) — that governs written chat, not speech. Keep the conversation two-way: don't dump a long monologue and move on, check in and let the user respond before continuing.

Write it the way it will be heard, not the way it would be laid out on a page. No bullet lists, no headings, no markdown, no code fences, no parenthetical asides. A bare letter followed by a colon ("A: batch size") is spoken as "uh", so name choices in words ("option A is batch size and option B is epoch count"). Spell out symbols and abbreviations the way a person would say them. Carry tone with words, such as "hmm", "okay so" or "nice that's right", the way a person talking would.
