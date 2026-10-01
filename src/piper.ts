// Spec 038. The window's voice is Piper (OHF-Voice/piper1-gpl), synthesized on this PC: no
// online speech. mkb-agentops setup-stts.ps1 installs the pinned piper-tts into a venv and the
// pinned voices under PIPER_HOME. The daemon starts Piper's own HTTP server on first use and
// proxies it. The page cuts text into sentences (/voice/split), renders up to three clips ahead
// (/voice/clip) and falls back to a local Windows voice when a clip fails.
import type http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { segment } from './sentences.ts';

export const PIPER_HOME = process.env.STTS_PIPER_HOME ||
  path.join(process.env.LOCALAPPDATA || '', 'cc-gc-stts', 'piper');
const PY = path.join(PIPER_HOME, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const VOICES = path.join(PIPER_HOME, 'voices');
const PORT = Number(process.env.STTS_PIPER_PORT) || 15987;
export const DEFAULT_VOICE = 'en_US-lessac-medium';
const log = (s: string) => console.error(`${new Date().toISOString()} piper ${s}`);

const num = (v: string | null, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return v !== null && v !== '' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export function installedVoices(): string[] {
  try { return fs.readdirSync(VOICES).filter((f) => f.endsWith('.onnx') && fs.existsSync(path.join(VOICES, f + '.json'))).map((f) => f.slice(0, -5)).sort(); }
  catch { return []; }
}

let proc: ChildProcess | null = null;
export const stopPiper = () => { proc?.kill(); proc = null; ready = null; };
let ready: Promise<void> | null = null;
function piper(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    const vs = installedVoices();
    if (!fs.existsSync(PY) || !vs.length) throw new Error(`piper not installed under ${PIPER_HOME} (run mkb-agentops setup-stts.ps1 -Apply)`);
    const model = vs.includes(DEFAULT_VOICE) ? DEFAULT_VOICE : vs[0];
    proc = spawn(PY, ['-m', 'piper.http_server', '--host', '127.0.0.1', '--port', String(PORT), '-m', path.join(VOICES, model + '.onnx'), '--data-dir', VOICES, '--sentence-silence', '0.2'],
      { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    proc.stderr?.on('data', (d) => { const s = String(d).trim(); if (/error|warn/i.test(s)) log(s.slice(0, 300)); });
    proc.on('exit', (c) => { log(`server exited ${c}`); proc = null; ready = null; });
    process.on('exit', () => proc?.kill());
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`http://127.0.0.1:${PORT}/info`, { signal: AbortSignal.timeout(1000) })).ok) { log(`server up, default ${model}`); return; } } catch { }
      if (!proc) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    proc?.kill();
    throw new Error('piper server did not start');
  })();
  ready.catch((e) => { log('start failed: ' + e.message); ready = null; });
  return ready;
}

async function body(req: http.IncomingMessage) {
  let s = '';
  for await (const c of req) s += c;
  return s;
}

export async function handleVoice(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
  if (!url.pathname.startsWith('/voice/')) return false;
  try {
    if (url.pathname === '/voice/voices') {
      piper().catch(() => { });   // warm up: the server takes ~8 s to start, a clip then ~0.5 s
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(installedVoices().map((name) => ({ name, lang: name.split('-')[0].replace('_', '-') }))));
      return true;
    }
    if (url.pathname === '/voice/split' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(segment(await body(req))));
      return true;
    }
    if (url.pathname === '/voice/clip') {
      const text = url.searchParams.get('text') || '';
      if (!text.trim()) throw new Error('no text');
      const vs = installedVoices(), voice = url.searchParams.get('voice') || (vs.includes(DEFAULT_VOICE) ? DEFAULT_VOICE : vs[0]);
      if (!vs.includes(voice)) throw new Error('voice not installed: ' + voice);
      const rate = num(url.searchParams.get('rate'), 0.5, 2, 1.3);
      await piper();
      const t0 = Date.now();
      const r = await fetch(`http://127.0.0.1:${PORT}/synthesize`, {
        method: 'POST', body: JSON.stringify({ text, voice, length_scale: 1 / rate }), signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new Error(`piper ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      log(`clip ok ${voice} ${buf.length}B ${Date.now() - t0}ms "${text.slice(0, 30)}"`);
      res.writeHead(200, { 'Content-Type': 'audio/wav' });
      res.end(buf);
      return true;
    }
    res.writeHead(404);
    res.end();
  } catch (err) {
    log('clip failed: ' + ((err as Error)?.message || err));
    // The page falls back to a local Windows voice on any failure.
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end(String((err as Error)?.message || err));
  }
  return true;
}
