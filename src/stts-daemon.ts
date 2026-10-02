import http from 'node:http';
import fs, { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import * as ChromeLauncher from 'chrome-launcher';
import { WebSocketServer, WebSocket } from 'ws';
import { CONVERSATION_ENDED, NO_SPEECH, LISTEN_CONTINUES, STOPPED, BACKGROUND_RESULT, readsUnfinished } from './protocol.ts';
import { handleVoice } from './piper.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Spec 008: STTS_PORT exists so a test can run a daemon of its own without
// taking the fixed port from the one serving the agent.
const FIXED_PORT = Number(process.env.STTS_PORT) || 15986;

type RequestConfig = {
  mode: 'stt' | 'tts';
  title: string;
  action: string;
  initialText?: string;
  startRecording?: boolean;
  text?: string;
  rate?: number;         // spec 029: tts only, this window instance only, never saved
  volume?: number;       // spec 029: 0 to 1, same
  oneshot?: boolean;
  close?: boolean;       // spec 004: close the window once this request is answered
  idleSec?: number;      // spec 010: stt only, answer NO_SPEECH after this long with nothing heard
  timeoutMs?: number;    // spec 012: what is left of the caller's tool-call budget, capped at REQUEST_TIMEOUT_MS
  ack?: number;          // spec 044: stt only, the turn id the agent answered without speaking
};

type Pending = {
  config: RequestConfig;
  respond: (text: string) => void;
  cancel: (reason: string) => void;
};

// Spec 007. Nothing else frees a pending request that is heard by nobody.
// The daemon holds one request at a time and a second caller is answered `409
// busy`, so a request that never resolves makes the voice window unusable for
// every agent until the daemon is restarted. Measured 2026-09-24: a `tts` with
// `listen` was spoken into an empty room, the calling tool gave up at the
// gateway's ceiling, and the request was still held minutes later. The release
// on the caller's socket closing cannot be relied on either: a client that
// destroys its request (probed with the built client) leaves the request
// pending here. So the daemon bounds itself, at the same value the client uses,
// which is under the gateway's ~300-second tool-call ceiling on purpose: the
// caller must be the one left waiting, never the daemon.
const REQUEST_TIMEOUT_MS = Number(process.env.STTS_REQUEST_TIMEOUT_MS) || 240_000;

let pending: Pending | null = null;

// Spec 044. Strict turns. Every transcript returned gets the next turn id and its
// capture times. A returned turn must be answered (any tts) or acked before the
// next listen opens. An exact repeat of the last turn, or speech captured before
// it ended, is never returned. A turn cut mid-thought is joined with what follows.
const JOIN_SEC = Number(process.env.STTS_JOIN_SEC) || 3;   // wait this long for the rest of a cut turn
const JOIN_MAX = 3;                                        // ponytail: at most 3 joins, then return what there is
let turnId = 0;
let unanswered = 0;   // id of the last returned turn the agent has not answered
let lastNorm = '';    // normalised text of the last returned turn
let lastEndAt = 0;    // capture end of the last returned turn
let held: { text: string; startAt: number; endAt: number; joins: number } | null = null;
const normText = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const hhmmss = (ms: number) => new Date(ms).toTimeString().slice(0, 8);

function turnReply(h: { text: string; startAt: number; endAt: number }): string {
  turnId++; unanswered = turnId; lastNorm = normText(h.text); lastEndAt = h.endAt;
  return `[turn ${turnId}, heard ${hhmmss(h.startAt)} to ${hhmmss(h.endAt)}] ${h.text}`;
}

// What a listen that is ending now returns: the held turn if any, else the marker.
function heldOr(marker: string): string {
  if (!held) return marker;
  const h = held; held = null;
  return turnReply(h);
}
let pendingTimer: NodeJS.Timeout | null = null;
let pageSocket: WebSocket | null = null;
let chrome: ChromeLauncher.LaunchedChrome | null = null;
let chromeLaunching: Promise<void> | null = null;

function loadHtml(): string {
  return fs.readFileSync(path.resolve(__dirname, 'stts_ui.html'), 'utf-8');
}

// Spec 031: Chrome, from Program Files. Edge was removed from this machine
// (2026-10-01) and is banned by a house hook, so it is never looked for.
// chrome-launcher's own search stays as the fallback (ERR_LAUNCHER_NOT_INSTALLED).
function resolveBrowserPath(): string | undefined {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const chromes = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];
  const chrome = chromes.find((p) => fs.existsSync(p));
  if (chrome) return chrome;
  try {
    const found = ChromeLauncher.Launcher.getFirstInstallation();
    if (found) return found;
  } catch {}
  return undefined;
}

// The page keeps every setting (voice, rate, auto-send, theme) in this profile's
// localStorage, so the profile lives under the user's app-data, not %TEMP%,
// where disk cleanup would silently reset all of it. One-time move of the old
// %TEMP% profile so nothing already chosen is lost.
function getChromeUserDataDir(): string {
  const base = process.platform === 'win32'
    ? (process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || tmpdir(), 'AppData', 'Local'))
    : path.join(process.env.HOME || tmpdir(), '.local', 'share');
  // Spec 026: a daemon on a test port gets its own browser profile, so a test's
  // window can never share a browser process with the live one.
  const dir = path.join(base, 'cc-gc-stts', FIXED_PORT === 15986 ? 'profile' : `profile-${FIXED_PORT}`);
  const old = path.join(tmpdir(), 'cc-gc-stts-user-data-dir');
  if (!fs.existsSync(dir) && fs.existsSync(old)) {
    mkdirSync(path.dirname(dir), { recursive: true });
    try { fs.renameSync(old, dir); } catch {}
  }
  mkdirSync(dir, { recursive: true });
  return dir;
}

function bringWindowToFront(port: number): void {
  if (!port) return;
  const req = http.get(`http://127.0.0.1:${port}/json`, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const targets = JSON.parse(data);
        const page = targets.find((t: any) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page?.webSocketDebuggerUrl) {
          const ws = new WebSocket(page.webSocketDebuggerUrl);
          ws.once('open', () => {
            ws.send(JSON.stringify({ id: 1, method: 'Page.bringToFront' }));
            setTimeout(() => { try { ws.close(); } catch {} }, 500);
          });
          ws.once('error', () => {});
        }
      } catch {}
    });
  });
  req.on('error', () => {});
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function shutdown() {
  try { if (chrome) chrome.kill(); } catch {}
  process.exit(0);
}

async function ensureChrome() {
  // A window already connected serves the request: after a daemon restart the
  // old window reconnects on its own, and a second one would only replace it.
  if (!chrome && pageSocket?.readyState === WebSocket.OPEN) return;
  if (chrome) {
    if (chrome.process && !chrome.process.killed) {
      if (chrome.port && raiseOnRequest) bringWindowToFront(chrome.port);
      return;
    }
    chrome = null;
  }
  if (chromeLaunching) return chromeLaunching;
  chromeLaunching = (async () => {
    try {
      const userDataDir = getChromeUserDataDir();
      chrome = await ChromeLauncher.launch({
        chromePath: resolveBrowserPath(),
        startingUrl: 'about:blank',
        userDataDir,
        ignoreDefaultFlags: true,
        chromeFlags: [
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-infobars',
          // Spec 039. Mark-approved flags; each checked against peter.sh/experiments/chromium-command-line-switches on 2026-10-02.
          // --test-type hides the unsupported-flag infobar the mic flag raises. AutomationControlled is a blink feature, not a switch.
          '--test-type',
          '--disable-blink-features=AutomationControlled',
          `--app=http://127.0.0.1:${FIXED_PORT}/`,
          '--window-size=1600,600',
          '--autoplay-policy=no-user-gesture-required',
          '--use-fake-ui-for-media-stream',
          // Spec 002. The window is usually behind the terminal, and Chromium
          // throttles a hidden page's timers (to once a minute after a while),
          // which delayed the barge-in pause by tens of seconds (2026-09-09).
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
        ],
      });
      if (chrome?.port) {
        bringWindowToFront(chrome.port);
      }
      chrome.process.on('exit', () => {
        chrome = null;
        if (pageSocket) {
          try { pageSocket.close(); } catch {}
          pageSocket = null;
        }
        if (pending) {
          const p = pending;
          pending = null;
          clearPendingTimer();
          p.respond('');
        }
      });
    } finally {
      chromeLaunching = null;
    }
  })();
  return chromeLaunching;
}

function deliverToPage() {
  if (!pending || !pageSocket || pageSocket.readyState !== WebSocket.OPEN) return;
  pageSocket.send(JSON.stringify({ type: 'request', config: pending.config }));
}

// Spec 002. Speech heard while no request is pending, reported by the page
// after Mark's pause. A house hook fetches it before every tool call, so it
// reaches the working agent as an addition, not a stop. Spec 003. Whether a
// request raises the window; the page sends its settings on connect and on
// change.
let voiceOwner = ''; // spec 018: session|agent of the agent in the voice loop
let raiseOnRequest = false;

// Spec 004. The window closes when the conversation is over: the last tts of a
// voice loop asks for it with close (End conversation in the page shuts the
// daemon itself). The daemon stays up so the next call is fast.
function closeWindow() {
  try { if (chrome) chrome.kill(); } catch {}
  chrome = null;
}

function clearPendingTimer() {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

function resolvePending(text: string) {
  if (!pending) return;
  const p = pending;
  pending = null;
  clearPendingTimer();
  p.respond(text);
  // Spec 026: only the main session closes the window. The hook marks the caller
  // (voiceOwner = session|agent); a helper has a non-empty agent part.
  if (p.config.close && (!voiceOwner || voiceOwner.endsWith('|'))) setTimeout(closeWindow, 200);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(loadHtml());
    return;
  }

  if (await handleVoice(req, res, url)) return;   // spec 038

  if (req.method === 'GET' && url.pathname === '/api/ping') {
    res.writeHead(200, { 'X-Stts-Dir': __dirname });   // spec 041
    res.end('ok');
    return;
  }

  if (req.method === 'GET' && url.pathname === '/barge') {
    // Spec 018/026: an stt/tts caller (`owner=1`) marks who owns the voice.
    // Spec 042: speech is no longer queued here, so text is always empty.
    const who = url.searchParams.get('who') || '';
    if (who && url.searchParams.get('owner') === '1') voiceOwner = who;
    // Spec 015. open: the voice window is connected, so a voice loop is live.
    // The house hook refuses a sleep while it is, so Mark never talks to a dead agent.
    const open = pageSocket?.readyState === WebSocket.OPEN;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ text: '', open }));
    return;
  }

  // Spec 043. The agent's SubagentStop hook posts here when a background agent
  // finishes. An open listen returns BACKGROUND_RESULT at once; the page keeps any
  // half-said words (released), as at the time limit. No listen open: nothing to do,
  // the agent sees the result on its own turn.
  if (req.method === 'POST' && url.pathname === '/notify') {
    const listening = pending?.config.mode === 'stt';
    if (listening) {
      if (pageSocket?.readyState === WebSocket.OPEN) pageSocket.send(JSON.stringify({ type: 'released' }));
      resolvePending(heldOr(BACKGROUND_RESULT));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ interrupted: listening }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/shutdown') {
    res.writeHead(200);
    res.end('ok');
    setTimeout(shutdown, 50);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/request') {
    // Spec 024. The newest request takes over. An interrupted tool call (Esc,
    // a cancelled turn, a gateway that never forwards the cancel) leaves its
    // request held here, and every later call was refused `409 busy` until the
    // daemon was restarted by hand (2026-09-30). One window serves one
    // conversation, so a new call means the old caller is gone: its request is
    // answered as superseded and the new one proceeds. A superseded listen tells
    // the page to keep what it heard, as at the time limit, so no speech is lost.
    let config: RequestConfig;
    try {
      config = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400);
      res.end('bad json');
      return;
    }
    // Spec 044. Answer, then listen. A listen while the last returned turn is
    // unanswered is refused (it would be the "answered two turns later" bug);
    // any tts answers it, an stt with ack=<that turn id> skips speaking.
    if (config.mode === 'tts') unanswered = 0;
    else if (unanswered && Number(config.ack) !== unanswered) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: `turn ${unanswered} is unanswered. Answer it now with tts (listen=true), ` +
          `or, if it needs no spoken answer, call stt with ack=${unanswered}.`,
      }));
      return;
    } else unanswered = 0;
    if (pending) {
      const old = pending;
      pending = null;
      clearPendingTimer();
      if (old.config.mode === 'stt' && pageSocket?.readyState === WebSocket.OPEN) {
        pageSocket.send(JSON.stringify({ type: 'released' }));
      }
      old.cancel('superseded by a newer stts request');
    }

    let responded = false;
    const entry: Pending = {
      config,
      respond: (text: string) => {
        if (responded) return;
        responded = true;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text }));
      },
      cancel: (reason: string) => {
        if (responded) return;
        responded = true;
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: reason }));
      },
    };
    pending = entry;
    // Spec 007. The watchdog: whoever asked has gone quiet, so the request is
    // released here rather than holding the daemon until it is restarted.
    // Spec 012. The bound is what is left of the caller's tool-call budget, so a
    // tts followed by a listen still returns inside it. A listen is never failed
    // at the bound: the page is told to keep what it heard (it becomes carry, then
    // the next listen or a barge-in), and the caller is told to listen again.
    // Failing it lost everything Mark said during a long answer (2026-09-28).
    const bound = Math.min(Number(config.timeoutMs) || REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS);
    pendingTimer = setTimeout(() => {
      if (pending !== entry) return;
      pending = null;
      pendingTimer = null;
      if (config.mode === 'stt') {
        if (pageSocket?.readyState === WebSocket.OPEN) pageSocket.send(JSON.stringify({ type: 'released' }));
        entry.respond(heldOr(LISTEN_CONTINUES));
        return;
      }
      entry.cancel(
        `no answer from the voice window within ${Math.round(bound / 1000)}s; the request was released so the next call is not refused`
      );
    }, bound);

    const release = () => {
      if (!responded && pending === entry) {
        pending = null;
        clearPendingTimer();
      }
    };
    req.on('close', release);
    res.on('close', release);

    try {
      await ensureChrome();
    } catch (e) {
      // A browser that will not start is one failed request, not a dead daemon.
      pending = null;
      clearPendingTimer();
      responded = true;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `browser launch failed: ${(e as Error).message}` }));
      return;
    }
    deliverToPage();
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket) => {
  if (pageSocket && pageSocket !== socket && pageSocket.readyState === WebSocket.OPEN) {
    try { pageSocket.close(4000, 'replaced'); } catch {}
  }
  pageSocket = socket;

  socket.on('message', (raw) => {
    let msg: { type?: string; text?: string };
    try {
      msg = JSON.parse(raw.toString('utf-8'));
    } catch {
      return;
    }
    switch (msg.type) {
      case 'ready':
        deliverToPage();
        return;
      case 'complete': {
        const text = typeof msg.text === 'string' ? msg.text.trim() : '';
        // Spec 042. Speech with no listen open is not kept for later.
        if (pending?.config.mode !== 'stt') return;
        const m = msg as { startAt?: number; endAt?: number };
        const endAt = Number(m.endAt) || Date.now();
        const startAt = Number(m.startAt) || endAt;
        const relisten = (idleSec: number) => {
          // The page went idle when it sent; open it again for the same listen.
          pending!.config = { ...pending!.config, idleSec };
          deliverToPage();
        };
        // Spec 044. Duplicate or stale: never returned, keep listening.
        // The same words said again later (a second "yes") are a new turn: only a repeat whose
        // capture overlaps the last turn (within 1 s of its end) is the same speech delivered twice.
        const dup = normText(text) === lastNorm && startAt <= lastEndAt + 1000;
        if (!held && (!text || dup || (lastEndAt && endAt <= lastEndAt))) {
          console.error(`${new Date().toISOString()} turn dropped (duplicate or stale): ${text.slice(0, 80)}`);
          relisten(pending.config.idleSec ?? 0);
          return;
        }
        const h = held
          ? { text: `${held.text} ${text}`.trim(), startAt: held.startAt, endAt, joins: held.joins + 1 }
          : { text, startAt, endAt, joins: 0 };
        // Spec 044. Cut mid-thought: hold it and listen JOIN_SEC more for the rest.
        if (readsUnfinished(h.text) && h.joins < JOIN_MAX) {
          held = h;
          relisten(JOIN_SEC);
          return;
        }
        held = null;
        resolvePending(turnReply(h));
        return;
      }
      case 'cancel':
      case 'close':   // 'close' is also the page's normal end of a tts turn; it never closes the window
        resolvePending('');
        return;
      case 'nospeech':
        // Spec 010. Nothing heard within idleSec. Only an stt request can end this way.
        if (pending?.config.mode === 'stt') resolvePending(heldOr(NO_SPEECH));
        return;
      case 'stopped':
        // Spec 013. He stopped the speaking turn; a reading must not go on to its next part.
        if (pending?.config.mode === 'tts') resolvePending(STOPPED);
        return;
      case 'ended':
        // Spec 008. End conversation, said in a word the agent cannot mistake
        // for speech and does not have to infer from an empty string.
        resolvePending(CONVERSATION_ENDED);
        return;
      case 'log':
        // Spec 011. The page's microphone restarts and recognizer errors, into daemon.log.
        if (typeof msg.text === 'string') console.error(`${new Date().toISOString()} page ${msg.text.slice(0, 300)}`);
        return;
      case 'settings':
        raiseOnRequest = !!(msg as { raise?: boolean }).raise;
        return;
    }
  });

  const detach = () => {
    if (pageSocket === socket) pageSocket = null;
  };
  socket.on('close', detach);
  socket.on('error', detach);
});

server.requestTimeout = 0;
server.headersTimeout = 0;
server.timeout = 0;
server.keepAliveTimeout = 0;

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    process.exit(0);
  } else {
    console.error('server error', err);
    process.exit(1);
  }
});

server.listen(FIXED_PORT, '127.0.0.1');

// Spec 009. stderr is the daemon log (daemon-client.ts spawnDaemon). A start
// line and an exit line bracket every life, so a death that throws nothing,
// such as a kill from outside, still shows as a start with no matching exit.
console.error(`${new Date().toISOString()} daemon start pid ${process.pid}`);
process.on('exit', (code) => console.error(`${new Date().toISOString()} daemon exit pid ${process.pid} code ${code}`));

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
