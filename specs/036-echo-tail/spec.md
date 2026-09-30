# 036 - The agent's last words are not sent back as Mark's

## What it does

Right after the agent stops speaking, a transcript that starts with the
agent's own last words has those words cut. Whatever Mark says after them is
kept.

## Why it exists

2026-10-01: the agent said "...click once, then say hello." and the listen
returned "Then say hello". With on-device recognition (spec 035) and clip
playback (spec 034), the last clip's result can close after the voice stopped
as a new result, so the spec 032 trim (`echoIdx`) never saw it, and
`isSpokenBack` needs four content words.

## How it works

`stripTail` in `src/stts_ui.html`, applied to finals and interims in the Talk
panel from `onResult`. While the agent speaks or up to 5 s after it stopped,
the longest leading run of transcript words that appears contiguously in the
last 12 spoken words (case and punctuation ignored) is cut.

Known limit: if Mark's first words repeat the agent's last words in order
within 5 s, they are cut.

## What it reads and writes

Reads the spoken text and `speakEndedAt`. Writes nothing new.

## How to run, check, and hand over

`node --test test/echo-tail.test.mjs`
