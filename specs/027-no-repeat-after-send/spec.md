# 027 - A listen returns only what was not already delivered

## What it does

When Mark keeps talking after part of his sentence was already sent to the
agent, the next listen returns only the new words. Nothing he said comes back
twice, and nothing is dropped.

## Why it exists

Live on 2026-09-30 the agent sent Mark's turn, saw it looked unfinished, and
listened again for 1 second (spec 023). The second return repeated the whole
first return plus the new words, and the third repeated it all again, this
time in the capitals and commas of Edge's final version.

The cause: Edge's speech recognizer keeps one "open result" per utterance, and
every update to it carries the whole utterance so far, not just the new words.
The page only cut the already-sent part from the final version, only within
4 seconds, and only when the final matched word for word. The live updates
(interim text) were never cut, so each new listen re-sent the start.

## How it works

- `src/stts_ui.html`, `dedupe`: remembers the full open result as it was when
  sent (`rawInterim`). Every later interim and the final have that part cut
  off. Only the final (the utterance closing) makes it forget.
- If Edge re-worded the final ("OK" became "Okay"), the cut is made after the
  last three words that were sent. If those are not found, the text is kept
  whole: a repeat is better than a lost word (spec 019).
- The memory lasts 60 seconds instead of 4, because Edge can take that long to
  close an utterance.

### Parity with the call bot

| Behavior | stts | callbot | Why they differ |
| --- | --- | --- | --- |
| Speech already delivered is not delivered again | Cut from Edge's growing open result | Nothing to cut: the bot keeps only final lines (`is_final`) and empties its buffer on delivery | Channel: the Meet transcript sends each final line once; Edge re-sends the whole utterance on every update |

## What it reads and writes

Nothing new. Page state only.

## How to run, check, and hand over

`node --test test/no-repeat-after-send.test.mjs` replays the 2026-09-30
sequence against the real page code. It fails on the code before this change.
