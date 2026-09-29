# 020 - The voice starts at the first punctuation mark

## What it does

The voice window speaks a reply in small pieces, cut at every punctuation mark:
full stops, question and exclamation marks, commas, semicolons, colons, dashes,
ellipses, brackets, quotes, pipes, bullets, line breaks and a slash between two
words. The first piece starts playing at once, so a long sentence joined by
commas no longer waits until the whole sentence is ready.

It never cuts inside a number (1,200 or 3.5), a time (7:35), a URL, an email
address, or a common abbreviation (Mr., Dr., e.g., U.S., a.m.).

## Why it exists

Mark (2026-09-30): speech was cut only at sentences, so a long sentence joined
by commas or semicolons started late. He asked for the smallest natural pieces
at every punctuation mark, in stts and the call bot together (rule 67).

## How it works

- `clauses(text)` in `src/stts_ui.html` makes the pieces. A cut is made at a
  space whose left side is a closing mark (`. , ; : ! ? ... ) ] } " | / - —`)
  or whose right side is an opening mark (`( [ { " • | / —`, or a `- ` or `* `
  bullet), and at every line break. Inside a word it cuts after an em dash, en
  dash or pipe, and at a slash between two plain words (`and/or`).
- Because a cut needs a space beside the mark, `1,200`, `3.5`, `7:35`, URLs and
  emails stay whole. A full stop after a known abbreviation, a single letter
  (`F.`) or a dotted run (`e.g.`, `U.S.`, `p.m.`) is not a cut.
- A piece with no letter or digit (a lone dash, a bullet) joins the next piece.
- `startSpeaking` queues one `SpeechSynthesisUtterance` per piece. The first
  piece's `start` marks the window speaking; the last piece's `end` finishes
  the turn, as the single utterance did before.
- The microphone mute (spec 016) resumes only when no piece is left in the
  queue (`synth.pending` is false), so it does not flicker between pieces.
- Read-aloud parts (spec 013) are unchanged: each 1000-character part is still
  one request to the window, and the window cuts it into pieces.

Neither maintained splitter fits. `Intl.Segmenter` (sentence) and the npm
package `sentence-splitter` 5.0.1 both cut "Mr. Smith" or a URL at its `?`
(tested 2026-09-30), and neither cuts at commas.

### Parity with the call bot

| Behavior | stts (this spec) | callbot (spec 006) | Why they differ |
| --- | --- | --- | --- |
| Where speech is cut | `clauses()`, every punctuation mark | The same `clauses()` code | Same |
| How a piece is played | One browser utterance per piece | One rendered clip per piece; a piece over 300 characters is cut at a word | Channel: the call bot renders audio on the server and a long clip takes seconds to render |
| Resuming a long read | By 1000-character part | By piece | Channel: the call bot plays and counts clips; stts sends parts to the window |
| Agent guidance on how to phrase a spoken reply | None added; the voice is near instant | `call_say` asks for short phrases; any punctuation is fine because every mark cuts a clip | Channel: the call bot has high latency, stts does not (Mark 2026-09-30) |

## What it reads and writes

Reads the text the agent passes to `tts`. Writes nothing new.

## How to run, check, and hand over

```
npm run build
node --test test/*.test.mjs
```

`test/clauses.test.mjs` lifts `clauses()` from the real page and runs a case
table (numbers, times, URLs, emails, abbreviations, dashes, quotes, bullets,
empty input) three times, a 5 MB reply, and checks the page queues one
utterance per piece. Live: speak a long comma sentence with `tts` and hear it
start at the first comma.

Hand over: this spec, `clauses` and `startSpeaking` in `src/stts_ui.html`.
