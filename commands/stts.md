---
name: stts
description: User speaks the prompt, which is sent to the Model, the received response is spoken/read aloud in a loop.
---

Call the stt MCP tool once and read its response. It is one of five things, and each has its own move:

- Exactly `__STTS_LISTEN_CONTINUES__`: the listen hit the tool-call time limit, usually because he is still talking. Nothing is lost: call stt again at once, silently, and it returns all of it.
- Exactly `__STTS_CONVERSATION_ENDED__`: he pressed End conversation and the window is already gone. Speak nothing, call no tool, stop.
- Exactly `__STTS_NO_SPEECH__`: he has not spoken yet, and the window is still listening. If a background result you promised him has landed, speak it through tts with listen true. Otherwise call stt again, silently. This is never the end of the conversation.
- Empty: the prompt was cancelled. Call the tts tool with the text 'Done.' and close set to true, which speaks it and closes the voice window, then stop.
- Anything else is his prompt. Answer it, and pass that answer to the tts MCP tool with listen set to true: it speaks the answer, then listens and returns the next thing he said, so one tool call serves each turn.

Treat every tts listen return exactly like an stt response and repeat. While the loop is running, do not output anything else to the user. Never sleep or block on another tool to wait for him: to wait, call stt again (its default idleSec, 200 seconds, is already the longest), so you answer the moment he stops talking. Pass a short idleSec (about 20) only while a background result you promised him is due. Hand any long work to a background subagent and keep listening.

Nothing he says controls the window; you hold the controls. If a tts returns "He spoke while you were speaking", your voice is still playing: if his words were meant for you (including stop, repeat, slower, go on), act on them, and your next tts or stt call cuts the playback; if they were not (a TV, someone else), call tts again to go on where it names.

Speak before you work, and speak at the end. If answering the prompt needs any tool call, first pass one short sentence to the tts tool with listen false, saying what you are about to do, then start. Silence while tools run reads as a hang. During the work, speak only at three moments, each one sentence with listen false: you hit a wall that needs the user (a code on their phone, an irreversible action), the plan changed from what they would expect, or the quiet is about to pass two minutes, in which case name the phase you are in. Never narrate individual tool calls or partial results; the user cares about the end result, and a running commentary is noise. The final answer always goes to tts with listen true, as above.

To read out something that already exists (a story, a chapter, notes, a document), pass its path as file (or a plain-text url) to tts instead of copying it into text. If the reply names a part to go on from, call tts again with that part.

Text passed to the tts tool is spoken aloud, not read. Compose it in plain, natural, conversational sentences regardless of any active text-compression style (e.g. caveman mode) — that governs written chat, not speech. Keep the conversation two-way: don't dump a long monologue and move on, check in and let the user respond before continuing.

Write it the way it will be heard, not the way it would be laid out on a page. No colons, no bullet lists, no headings, no markdown, no code fences, no parenthetical asides. A bare letter followed by a colon ("A: batch size") is spoken as "uh", so name choices in words ("option A is batch size, option B is epoch count"). Spell out symbols and abbreviations the way a person would say them. Use punctuation for delivery rather than layout: commas and periods for pauses, an ellipsis for a longer beat, a question mark to lift the voice, an exclamation mark for emphasis, and a dash for a change of thought. Use the same cues to carry tone, such as "hmm", "okay so", or "nice, that's right", the way a person talking would.
