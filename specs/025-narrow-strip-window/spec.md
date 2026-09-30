# 025 - The voice window works as a narrow strip

## What it does

The voice window can be dragged down to a thin strip (240 pixels wide, or
shorter than 200 pixels tall) and stays usable. Mark sees his own words appear
live as he speaks, wrapped, with the newest words always in view.

## Why it exists

Mark wants the window beside his work as a narrow strip, only to watch his
speech being transcribed (2026-09-30). The page used to force each panel to at
least 200 pixels wide, so the window could not get narrow, and the buttons ran
off the edge.

## How it works

All in `src/stts_ui.html`, with CSS media queries (no script does layout):

- The 200 pixel minimum on each panel is gone.
- Below 560 pixels wide the Talk and Listen panels stack, Talk on top with
  twice the room. History bars, labels, hints, the sound bars and every button
  label hide, so buttons show only their icon. End conversation reads "End".
- Below 360 pixels tall the Listen panel and the status text also hide, so the
  space goes to the words.
- Text is 17 pixels (16 in the strip) with 1.62 line height, the house type
  rule (rule 62). Long words wrap instead of scrolling sideways.
- Each time live or final words are written in, the box scrolls to the bottom.
- The daemon opens the window at 1600 by 600 and sets no minimum size, so
  nothing outside the page blocks narrowing.

### Parity with the call bot

| Behavior | stts | callbot | Why they differ |
| --- | --- | --- | --- |
| Narrow strip layout | Yes | None | Channel limit: the call bot has no window of its own, it speaks inside a Meet call |

## What it reads and writes

Nothing new. Only how the page is laid out.

## How to run, check, and hand over

`node build.mjs`, then `node --test test/*.test.mjs`
(`test/window-guard.test.mjs` checks the rules above). To see it, open
`dist/stts_ui.html` in a browser tab and narrow the viewport to 240 pixels:
no sideways scroll, text 16 pixels, End button inside the window.
