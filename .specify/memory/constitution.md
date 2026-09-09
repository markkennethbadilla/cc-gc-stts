# cc-gc-stts fork constitution

This is Mark's fork of `sandipchitale/cc-gc-stts`, the voice window every
agent on his machines talks through. Upstream has no specs. Every change
to the fork starts with a spec in `specs/`, written so a person who has
never opened the code understands what the feature does and why.

## I. One agent, one window, one profile

Mark talks to one agent at a time. The daemon serves one request at a
time and one browser window. Settings live in that window's profile,
under the user's app-data folder, and persist across restarts, disk
cleanup, and agent switches. Multi-agent voice is out of scope by
decision (Mark 2026-09-09).

## II. Speech is never lost

Every word Mark says while the window is open lands somewhere he can
see: the prompt box while an agent listens, a barge-in to the agent
while it works, the next prompt when nothing else applies. A word
dropped by the page is a defect, whatever else worked.

## III. A mid-turn message is an addition, not a stop

Spoken or typed, a message that arrives while an agent works is
something to answer briefly and keep going. The agent stops only when
the message says stop, wait, or gives a new direction. This is a house
rule for every agent, and the plugin repeats it with every barge-in it
delivers.

## IV. Mergeable with upstream

Fork additions to the page live in one script block at the end of
`src/stts_ui.html` that reads upstream's bindings and never edits
upstream's own code. Daemon and server additions are small and
additive. Taking an upstream update is fetch, merge, build, pin.

## V. Every agent

A feature that only works on one agent is not finished. Claude Code
carries the plugin, Antigravity imports it, Codex, Grok, and OpenCode
reach it through the MCP gateway. Rules and hooks that the feature
needs live in `mkb-agentops`, which publishes to all five.

## VI. Built, tested, pinned

`npm run build` after every change, `dist/` committed. Page behaviour
is proved with synthetic recognizer events over the DevTools protocol
before a pin bump, and the pin in `mkb-agentops/versions.json` moves in
the same session as the merge. Fork `main` is the only source of truth;
its ruleset refuses force pushes and deletion.
