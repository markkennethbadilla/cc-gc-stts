# 013 - Read content aloud by reference

## What it does

`tts` can read out content that already exists without the agent copying it into
the call. Pass `file` (a local path) or `url` (plain text or markdown) instead of
`text`. The server reads it, removes markdown markup, and speaks it in parts. It
is general: a story, a novel chapter, study notes, a document.

## Why it exists

Reading a long document through `text` makes the agent type every word of it as
output, which is slow and costs tokens for words it already has on disk. The
server can read the file itself.

## How it works

- Exactly one of `text`, `file` or `url`. A `.md` file or markdown URL goes
  through `remove-markdown` (pinned 0.7.0, pure string functions, no network).
  Plain text is spoken as it is. An HTML page is refused with a message to save
  its text to a file first, because markup read aloud is noise.
- The text is cut into parts of at most 1000 characters (about a minute of
  speech) at sentence ends, found by the platform's `Intl.Segmenter`. A sentence
  longer than that is cut at a space.
- Parts are spoken one after another. No new part starts after half the call's
  budget (spec 012), so the call returns in time. If parts remain, it says
  `Read parts 1 to 5 of 20. To go on, call tts again with the same file and
  part=6.` and does not listen in between.
- "stop it", the stop button, or talking over it in headphone mode ends the turn.
  The page sends `stopped`, the daemon answers `__STTS_STOPPED__`, the reading
  goes no further, and the reply says which part to resume at. With `listen`, it
  goes straight to listening.
- With `listen`, the first reply block is what he said next and the second is the
  reading note.

## What it reads and writes

- Reads the given file, or fetches the given URL with Node's own `fetch` (30
  second timeout).
- Writes nothing.

## How to run, check, and hand over

```
npm run build
node --test test/long-speech-and-read.test.mjs test/page-keeps-speech.test.mjs
```

The tests check that every word survives the split at 1 MB, a 5000-character
word and mixed line endings, three times each; that markdown loses its markup
and plain text keeps its own; that HTML, a 404, a missing file and bad argument
sets are refused with a reason; and, through the real MCP server, a full reading
followed by a listen, a stop at part 2, and a reading that runs out of time and
continues from the part it names.

Hand over: this spec, `src/read-aloud.ts`, `src/stts-mcp-server.ts`, the
`stopped` message in `src/stts-daemon.ts` and `src/stts_ui.html`.
