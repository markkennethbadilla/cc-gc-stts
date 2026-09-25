import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const FIXED_PORT = 15986;

// A request the caller abandons must not keep the daemon. The daemon holds one
// pending request at a time and frees it when this client closes the connection
// (stts-daemon.ts, `req.on('close')`), so a client that waits forever is a client
// that wedges every later tool call until the daemon is restarted. That happened
// on 2026-09-24: a long `tts` with `listen` was heard by nobody, the gateway gave
// up at its 300-second ceiling, and the daemon stayed busy for four minutes and
// counting. This bound is therefore set by the gateway's ceiling, not by taste:
// it has to fire first. A voice turn that needs longer than this is a turn whose
// text should be split. STTS_REQUEST_TIMEOUT_MS overrides it for a live check.
export const REQUEST_TIMEOUT_MS = Number(process.env.STTS_REQUEST_TIMEOUT_MS) || 240_000;

export interface SttConfig {
  title: string;
  action: string;
  initialText: string;
  startRecording: boolean;
}

export interface TtsConfig {
  title: string;
  action: string;
  text: string;
  oneshot: boolean;
  close?: boolean;
}

type PingResult = 'ours' | 'foreign' | 'closed';

function pingDaemon(): Promise<PingResult> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: FIXED_PORT,
        path: '/api/ping',
        method: 'GET',
        timeout: 500,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8').trim();
          resolve(res.statusCode === 200 && body === 'ok' ? 'ours' : 'foreign');
        });
      }
    );
    req.on('error', () => resolve('closed'));
    req.on('timeout', () => {
      req.destroy();
      resolve('foreign');
    });
    req.end();
  });
}

function probePortOpen(): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: '127.0.0.1', port: FIXED_PORT });
    const done = (open: boolean) => {
      sock.destroy();
      resolve(open);
    };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.setTimeout(300, () => done(false));
  });
}

function resolveDaemonScript(): string {
  const candidates = [
    path.join(__dirname, 'stts-daemon.mjs'),
    path.join(__dirname, 'stts-daemon.js'),
    path.join(__dirname, '..', 'dist', 'stts-daemon.mjs'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

// Spec 009. The daemon's stderr goes to a file, so a crash leaves its stack
// behind. With stdio ignored, the daemon died on 2026-09-26 between two voice
// turns and nothing said why.
export function daemonLogPath(): string {
  const base = process.platform === 'win32'
    ? (process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '.', 'AppData', 'Local'))
    : path.join(process.env.HOME || '.', '.local', 'share');
  return path.join(base, 'cc-gc-stts', 'daemon.log');
}

function spawnDaemon(): void {
  const script = resolveDaemonScript();
  let out: number | 'ignore' = 'ignore';
  try {
    const log = daemonLogPath();
    fs.mkdirSync(path.dirname(log), { recursive: true });
    out = fs.openSync(log, 'a');
  } catch {}
  const child = spawn(process.execPath, [script], {
    detached: true,
    stdio: ['ignore', out, out],
    env: process.env,
  });
  child.unref();
  if (typeof out === 'number') fs.closeSync(out);
}

async function ensureDaemon(): Promise<void> {
  const initial = await pingDaemon();
  if (initial === 'ours') return;
  if (initial === 'foreign') {
    throw new Error(
      `port ${FIXED_PORT} is already in use by another process (not the stts daemon)`
    );
  }
  spawnDaemon();
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const status = await pingDaemon();
    if (status === 'ours') return;
    if (status === 'foreign') {
      throw new Error(
        `port ${FIXED_PORT} is held by a foreign process; cannot start stts daemon`
      );
    }
  }
  if (await probePortOpen()) {
    throw new Error(
      `stts daemon did not become healthy on port ${FIXED_PORT}, but the port is open`
    );
  }
  throw new Error('stts daemon failed to start');
}

export function postRequest(
  body: object,
  port: number = FIXED_PORT,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/request',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode === 409) {
            reject(new Error('stts daemon is busy with another request'));
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`stts daemon returned ${res.statusCode}: ${raw}`));
            return;
          }
          try {
            const parsed = JSON.parse(raw);
            resolve(typeof parsed.text === 'string' ? parsed.text : '');
          } catch (e) {
            reject(e as Error);
          }
        });
      }
    );
    // Destroying the request closes the socket, which is what tells the daemon
    // to drop the pending request and answer the next caller instead of 409.
    req.setTimeout(timeoutMs, () => {
      req.destroy(
        new Error(
          `no answer from the voice window within ${Math.round(timeoutMs / 1000)}s; ` +
            'the request was dropped so the daemon is free for the next call'
        )
      );
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Spec 009. A reset connection means the daemon went away mid-request, so the
// window never finished this request. Start a fresh daemon and send it once
// more; a second failure is reported, never looped on.
const DAEMON_GONE = new Set(['ECONNRESET', 'ECONNREFUSED', 'EPIPE']);

export async function sendWithRetry(
  body: object,
  send: (b: object) => Promise<string> = postRequest,
  ensure: () => Promise<void> = ensureDaemon
): Promise<string> {
  await ensure();
  try {
    return await send(body);
  } catch (e) {
    if (!DAEMON_GONE.has((e as NodeJS.ErrnoException).code ?? '')) throw e;
    await ensure();
    return send(body);
  }
}

export async function launchStt(config: SttConfig): Promise<string> {
  return sendWithRetry({ mode: 'stt', ...config });
}

export async function launchTts(config: TtsConfig): Promise<void> {
  await sendWithRetry({ mode: 'tts', ...config });
}
