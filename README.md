# cc-gc-stts

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-blue.svg)](https://nodejs.org/)

Talk to **Claude Code**, **Gemini CLI** or **Antigravity CLI aka agy** and hear them talk back. This project adds seamless Speech-to-Text (STT) and Text-to-Speech (TTS) capabilities via a Model Context Protocol (MCP) server.

📰 **Read the story:** [True voice mode for Claude Code](https://www.linkedin.com/pulse/true-voice-mode-claude-code-sandip-chitale-rz5uc/)

![Talk](screenshots/stts-prompt.png)
![Listen](screenshots/stts-response.png)

## ✨ Features

- 🎙️ **Speech-to-Text (STT):** Dictate your prompts instead of typing.
- 🔊 **Text-to-Speech (TTS):** Hear the model's responses read aloud.
- 🔄 **Conversational Loop:** Use the `/stts` command for a continuous voice-driven session.
- 🚀 **Persistent Daemon:** Fast startup using a reusable Chrome window.
- 🛠️ **Cross-Platform:** Works with both Claude Code and Gemini CLI.
- 🕘 **History:** Recall past prompts and responses from a dropdown above each panel, or with `Alt+↑` / `Alt+↓`.

## 🏗️ How It Works

`stts` uses a background daemon to manage a persistent Chrome/Chromium window:

1.  **MCP Server:** Exposes `stt` and `tts` tools to the AI model. Talks to the daemon over plain HTTP — one short request per call, no polling, no per-call subprocess spawn.
2.  **Daemon:** A local HTTP + WebSocket server on port `15986` that controls a Chrome instance in "app mode". Stores its profile under `$TMPDIR/cc-gc-stts-user-data-dir`.
3.  **Browser UI ↔ Daemon:** A single persistent **WebSocket** at `/ws` carries every per-turn message. The daemon pushes a `request` frame the moment the model calls `stt` or `tts`; the page pushes back `complete` / `cancel` / `close` when the user is done.
4.  **Browser UI:** Uses the native **Web Speech API** for recognition and synthesis. Free at the wallet — note that on Linux Chrome routes recognition audio through Google's servers, so this is not a fully offline pipeline.
5.  **Smart Auto-Advance:** In the `/stts` voice loop, if you simply listen through the response without touching anything, the loop advances automatically the moment speech ends. Pressing **Stop** (or saying "stop it") ends the speaking turn at once, which also stops a long reading (spec 013); pressing **Play** (or saying "play it") replays and waits for a manual **Got it!**.
6.  **Automatic Lifecycle:** The daemon starts on demand and shuts down when the Chrome window is closed.
7.  **Port-collision aware:** If port `15986` is held by a non-stts process, the launcher fails fast with a clear error instead of timing out.

## 🚀 Quick Start

### 1. Build the project

```bash
npm install
npm run build
```

### 2. Install

#### **Claude Code**
```bash
claude plugins marketplace add https://github.com/sandipchitale/cc-gc-stts.git
claude plugin install stts
```

#### **Gemini CLI**
```bash
gemini extensions install --consent https://github.com/sandipchitale/cc-gc-stts.git
```

#### **Antigravity CLI**
```bash
agy plugin install --consent https://github.com/sandipchitale/cc-gc-stts.git
```

## ⌨️ Usage

### Conversational Loop
Run the voice-driven loop where you speak, the model processes, and the response is read back to you:
- **Claude Code:** `/stts`
- **Gemini CLI:** `/stts`
- **Antigravity CLI:** `/stts`

### Direct Tool Usage
You can also ask the model to "use the stt tool" or "speak this using tts" directly in your prompts.

## 🗣️ Voice Commands & Shortcuts

Both STT and TTS modes support voice-activated commands for a hands-free experience.

### Popular Commands
| Command | Action |
| :--- | :--- |
| `send prompt` | Submits your dictated text |
| `cancel prompt` | Aborts the current recording |
| `new paragraph` | Inserts a line break |
| `got it` | (TTS mode) Acknowledges the response and continues — only required if you used **Stop** or **Play** during playback; otherwise the loop auto-advances |
| `stop it` | (TTS mode) Stops the current playback (after this, **Got it!** is required to advance) |
| `play it` | (TTS mode) Replays the response (after this, **Got it!** is required to advance) |

> **Note:** Many more punctuation and formatting commands are supported (e.g., `insert comma`, `select all`, `undo it`). Toggle the side panel to see the full list.

**Keyboard Shortcuts:**
- `Ctrl+R`: Toggle recording/playback side panel.
- `Enter`: Send prompt (Talk side).
- `Escape`: Stop recording or close the commands panel.
- `Alt+↑` / `Alt+↓`: Cycle through prompt or response history when the textarea is focused.

![Voice command side panel](screenshots/stts-voice-commands.png)

## 🕘 Prompt & Response History

Each panel has a **History** bar above its textarea:

- **Talk** stores every submitted prompt; **Listen** stores every response received from the model.
- Pick an entry from the dropdown to load it into the textarea — fully editable. Hit **Enter** / **Send** to resubmit a prompt, or **Play** to replay a response.
- `Alt+↑` walks back through history; `Alt+↓` walks forward (your in-progress draft is preserved and restored at the bottom of the stack).
- History persists across sessions in `localStorage`, capped at 50 entries per side. Consecutive duplicates are not stored.
- Use the **Clear** button to wipe one side's history.

## 🛠️ Development & Manual Install

### Install from a local source

**Claude Code:**
```bash
claude plugins marketplace add "$PWD"
claude plugin install stts
```

**Gemini CLI:**
```bash
gemini extensions install --consent "$PWD"
```

**Antigravity CLI:**
```bash
agy plugin install "$PWD"
```

### Daemon Control
The daemon usually runs automatically, but you can manually stop it by closing the Chrome window or:
```bash
curl -X POST http://127.0.0.1:15986/api/shutdown
```

### Project Layout
- `src/stts-mcp-server.ts` — MCP server exposing the `stt` and `tts` tools. Calls the daemon HTTP API directly.
- `src/stts-daemon.ts` — local HTTP + WebSocket server on port `15986` that owns the Chrome window.
- `src/daemon-client.ts` — shared HTTP client used by the MCP server and the CLI.
- `src/stts.ts` — standalone CLI (`stts stt` / `stts tts`) for manual use and diagnostics.
- `src/stts_ui.html` — the Web Speech API UI rendered inside the Chrome window. Connects to the daemon over WebSocket at `/ws`.

### Daemon endpoints

| Path | Method | Used by | Purpose |
| :--- | :--- | :--- | :--- |
| `/` | GET | Chrome | Serves the UI HTML |
| `/api/ping` | GET | daemon-client | Health check (`ok` body confirms it's our daemon, not a foreign process) |
| `/request` | POST | daemon-client | MCP/CLI submits an `stt` or `tts` request; response body carries the result |
| `/api/shutdown` | POST | UI / CLI | Cleanly stops the daemon and Chrome |
| `/ws` | WebSocket | Browser UI | Single persistent channel — daemon pushes `request` frames; browser pushes `ready` / `complete` / `cancel` / `close` |

## 📋 Requirements

- **Node.js:** v18 or higher.
- **Chrome/Chromium:** Must be installed and discoverable.
- **Microphone:** Required for STT functionality.

## 📄 License

MIT — [Sandip Chitale](https://github.com/sandipchitale)

---

## Appendix A — One-shot prompt

The following prompt is self-contained: handed to a capable coding agent (Claude Code, Gemini CLI, etc.) in an empty repository, it should produce an implementation equivalent to the one in this project.

> **Build a voice-loop plugin for Claude Code and Gemini CLI called `stts`.** It exposes two MCP tools — `stt` (capture a spoken prompt and return the transcript) and `tts` (read a string aloud) — plus a slash command `/stts` that loops `stt → answer → tts` until the user is silent. Target Node.js 18+, TypeScript, esbuild for bundling.
>
> **Architecture.** Three processes:
>
> 1. **MCP server (stdio)** — registers `stt` and `tts` with the official `@modelcontextprotocol/sdk`. Each tool call POSTs JSON to a local daemon and returns the daemon's response.
> 2. **Daemon** — a single Node process listening on a fixed loopback port (use `15986`). It serves both an HTTP API and a WebSocket endpoint at `/ws` from the same `http.Server`, and it owns one persistent Chrome/Chromium window launched via `chrome-launcher` in `--app=` mode pointed at `http://127.0.0.1:15986/`. The daemon's HTTP routes are: `GET /` (the UI HTML), `GET /api/ping` (health probe — body `ok` identifies "our" daemon vs. a foreign process holding the port), `POST /request` (the MCP/CLI submission, body is `{ mode: 'stt' | 'tts', ... }`, response body is the result), `POST /api/shutdown`. Long-poll endpoints are explicitly **not** used. The daemon keeps at most one in-flight `Pending` request; a second `/request` while another is open returns `409`.
> 3. **Browser page** — a single HTML file the daemon serves. On load it opens a WebSocket to `/ws` and sends `{ "type": "ready" }`. The daemon pushes `{ "type": "request", "config": {...} }` frames; the page replies with `{ "type": "complete", "text": "..." }`, `{ "type": "cancel" }`, or `{ "type": "close" }`. The browser auto-reconnects on socket close. The page must reset to an idle UI on connect and re-activate when a `request` frame arrives.
>
> **Daemon-client.** Provide a shared module used by both the MCP server and a small CLI. It must: (a) ping the daemon; (b) if absent, spawn it detached with `unref()`; (c) if the port is held by something foreign, fail with a clear error; (d) POST `/request` and return the parsed `text` field.
>
> **Browser UI.** A two-panel page — *Talk* (STT) and *Listen* (TTS) — using only the browser's Web Speech API. Behaviors:
>
> - STT panel uses `webkitSpeechRecognition` with `continuous = true`, `interimResults = true`. Buttons: Send, Cancel, Dictate (toggle), Commands (panel), End conversation. Voice commands inserted into recognized text trigger UI actions: `send prompt`, `cancel prompt`, plus punctuation/formatting helpers (`new line`, `new paragraph`, `insert comma`, `select all`, `undo it`, etc.).
> - TTS panel uses `speechSynthesis`. Buttons: Play, Stop, Got it!, Refresh. Voice commands while listening: `play it`, `stop it`, `got it`. On a fresh request set `userInteracted = false`. Stop and Play set `userInteracted = true`.
> - **Smart auto-advance:** when `currentUtterance.onend` fires in oneshot mode (`config.oneshot === true`) **and** `userInteracted === false`, the page treats it like Got it! and immediately sends `{ type: 'close' }`. Otherwise it shows "Finished. Play again or click Got it! to continue." and waits for an explicit gesture.
> - On first load, `speechSynthesis.getVoices()` may return empty — nudge it with a zero-volume dummy `SpeechSynthesisUtterance` and listen for `voiceschanged`. When activating TTS, retry `synth.speak(...)` up to ~20×100 ms while voices are still loading, then fall back to a 5-second polling window before giving up.
> - Maintain per-side history (prompts, responses) in `localStorage`, capped at 50 entries each, with `Alt+↑` / `Alt+↓` cycling and a Clear button. Consecutive duplicates are not stored.
>
> **`/stts` slash command.** A markdown command file whose body instructs the model: "Call the `stt` tool. If the response is empty, output `Done.` and stop. Otherwise treat the response as a prompt, answer it, pass the answer to the `tts` tool. Repeat. While the loop runs, do not output anything else." The MCP `tts` tool sends `oneshot: true` so the page applies smart auto-advance.
>
> **Plugin packaging.** Provide `.claude-plugin/plugin.json` registering `stts-mcp` as an stdio MCP server pointing at the bundled daemon entrypoint, plus a Gemini extension manifest mirroring it. `package.json` declares dependencies `@modelcontextprotocol/sdk`, `chrome-launcher`, `commander`, `ws`. Build with esbuild: `bundle: true`, `platform: 'node'`, `format: 'esm'`, `target: 'node18'`, output to `dist/` as `.mjs`, copy `stts_ui.html` alongside.
>
> **Cross-cutting requirements.** Persist Chrome under `${tmpdir}/cc-gc-stts-user-data-dir` so cookies/voices/microphone permissions survive restarts. Disable the daemon's HTTP timeouts (`requestTimeout`, `headersTimeout`, `timeout`, `keepAliveTimeout` all `0`) so a parked `/request` cannot be killed by Node. On `EADDRINUSE` exit cleanly. On Chrome process exit, null out the WebSocket reference and resolve any pending request with `''`. Write everything in TypeScript with strict typing for the request/config shapes.
