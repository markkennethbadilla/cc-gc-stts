import http from 'node:http';
import fs, { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import * as ChromeLauncher from 'chrome-launcher';
import { WebSocketServer, WebSocket } from 'ws';
import { CONVERSATION_ENDED } from './protocol.ts';

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
  oneshot?: boolean;
  close?: boolean;       // spec 004: close the window once this request is answered
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
let pendingTimer: NodeJS.Timeout | null = null;
let pageSocket: WebSocket | null = null;
let chrome: ChromeLauncher.LaunchedChrome | null = null;
let chromeLaunching: Promise<void> | null = null;

function loadHtml(): string {
  return fs.readFileSync(path.resolve(__dirname, 'stts_ui.html'), 'utf-8');
}

// Edge first, always. The Microsoft Natural voices this window reads with are
// an Edge feature: Chrome's speechSynthesis sees only the local SAPI voices, so
// on a machine that had both, every Natural voice vanished from the picker, and
// Chrome reusing the Edge-written profile dir reset the saved voice as well
// (2026-09-19). Chrome remains the fallback where Edge is absent, which is the
// original reason this function exists (ERR_LAUNCHER_NOT_INSTALLED).
function resolveBrowserPath(): string | undefined {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const edges = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/microsoft-edge',
  ];
  const edge = edges.find((p) => fs.existsSync(p));
  if (edge) return edge;
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
  const dir = path.join(base, 'cc-gc-stts', 'profile');
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
          `--app=http://127.0.0.1:${FIXED_PORT}/`,
          '--window-size=1600,600',
          '--autoplay-policy=no-user-gesture-required',
          '--auto-accept-camera-and-microphone-capture',
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
const barge: string[] = [];
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
  if (p.config.close) setTimeout(closeWindow, 200);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(loadHtml());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/ping') {
    res.writeHead(200);
    res.end('ok');
    return;
  }

  if (req.method === 'GET' && url.pathname === '/barge') {
    const text = barge.splice(0).join(' ');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ text }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/shutdown') {
    res.writeHead(200);
    res.end('ok');
    setTimeout(shutdown, 50);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/request') {
    if (pending) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'busy' }));
      return;
    }
    let config: RequestConfig;
    try {
      config = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400);
      res.end('bad json');
      return;
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
    pendingTimer = setTimeout(() => {
      if (pending !== entry) return;
      pending = null;
      pendingTimer = null;
      entry.cancel(
        `no answer from the voice window within ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s; the request was released so the next call is not refused`
      );
    }, REQUEST_TIMEOUT_MS);

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
        let text = typeof msg.text === 'string' ? msg.text : '';
        // Barge-ins nobody fetched during the turn still reach the agent.
        if (pending?.config.mode === 'stt' && barge.length) text = [barge.splice(0).join(' '), text].filter(Boolean).join(' ');
        resolvePending(text);
        return;
      }
      case 'cancel':
      case 'close':   // 'close' is also the page's normal end of a tts turn; it never closes the window
        resolvePending('');
        return;
      case 'ended':
        // Spec 008. End conversation, said in a word the agent cannot mistake
        // for speech and does not have to infer from an empty string.
        resolvePending(CONVERSATION_ENDED);
        return;
      case 'barge':
        if (typeof msg.text === 'string' && msg.text.trim()) barge.push(msg.text.trim());
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

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
