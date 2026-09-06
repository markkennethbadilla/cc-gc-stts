---
name: stts
description: User speaks the prompt, which is sent to the Model, the received response is spoken/read aloud in a loop.
---

Call the stt MCP tool and read its response. If the response is empty, output 'Done.' and stop. Otherwise, treat the response as a prompt and answer it. Pass that answer to the tts MCP tool. Repeat in a loop. While the loop is running, do not output anything else to the user.

Text passed to the tts tool is spoken aloud, not read. Compose it in plain, natural, conversational sentences regardless of any active text-compression style (e.g. caveman mode) — that governs written chat, not speech. Keep the conversation two-way: don't dump a long monologue and move on, check in and let the user respond before continuing.
