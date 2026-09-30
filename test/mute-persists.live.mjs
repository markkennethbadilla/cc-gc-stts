// Spec 030, live. Own daemon (STTS_PORT) and throwaway profile, the real window:
// pause with Space, run 5 listens, the recognizer must never start; resume, it starts.
//   node build.mjs && node test/mute-persists.live.mjs
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import WebSocket from 'ws';

const PORT = Number(process.env.STTS_TEST_PORT) || 15990;
const gaps = process.argv.slice(2).map(Number).filter(Boolean);
const local = mkdtempSync(path.join(tmpdir(), 'stts-live-'));
const daemon = spawn(process.execPath, ['dist/stts-daemon.mjs'], {
  env: { ...process.env, STTS_PORT: String(PORT), LOCALAPPDATA: local },
  stdio: 'inherit',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function post(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body ?? {});
    const req = http.request({ host: '127.0.0.1', port: PORT, path: pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let raw = ''; res.on('data', (c) => { raw += c; });
      res.on('end', () => resolve({ status: res.statusCode, text: (() => { try { return JSON.parse(raw).text; } catch { return raw; } })() }));
    });
    req.on('error', reject); req.end(data);
  });
}
const alive = () => new Promise((r) => http.get(`http://127.0.0.1:${PORT}/api/ping`, (res) => r(res.statusCode === 200)).on('error', () => r(false)));

// The window's DevTools port, from the throwaway profile.
async function evalInPage(expr) {
  // chrome-launcher passes --remote-debugging-port on the browser's command line.
  const cmd = execFileSync('powershell', ['-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | ? { $_.CommandLine -like '*${path.basename(local)}*' } | select -expand CommandLine`], { encoding: 'utf8' });
  const port = cmd.match(/--remote-debugging-port=(\d+)/)?.[1];
  if (!port) return { gone: true };
  const targets = await new Promise((r) => http.get(`http://127.0.0.1:${port}/json`, (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => r(JSON.parse(d))); }));
  const page = targets.find((t) => t.type === 'page' && t.url.includes(String(PORT)));
  if (!page) return { gone: true };
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
  const msg = await new Promise((r) => ws.on('message', (m) => { const o = JSON.parse(m); if (o.id === 1) r(o); }));
  ws.close();
  return { value: msg.result?.result?.value };
}

const LISTENING = `document.getElementById('tts-container').classList.contains('listening')`;
const SPACE = `(() => { document.activeElement?.blur(); document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); return document.getElementById('pause-btn').classList.contains('paused'); })()`;
let failed = 0;
const check = (ok, what) => { if (!ok) failed++; console.log(`[${ok ? 'OK' : 'FAIL'}] ${what}`); };
try {
  for (let i = 0; i < 80 && !(await alive()); i++) await sleep(100);
  const first = post('/request', { mode: 'stt', idleSec: 4, timeoutMs: 60000 });
  let on = false;
  for (let s = 0; s < 10 && !on; s++) { await sleep(400); on = (await evalInPage(LISTENING)).value === true; }
  check(on, 'mic listening before pause');
  await first;
  check((await evalInPage(SPACE)).value === true, 'Space paused');
  await sleep(1500);
  for (let n = 1; n <= 5; n++) {
    const r = post('/request', { mode: 'stt', idleSec: 3, timeoutMs: 60000 });
    let heard = false;
    for (let s = 0; s < 8; s++) { await sleep(400); if ((await evalInPage(LISTENING)).value) heard = true; }
    const res = await r;
    check(!heard, `listen ${n}/5 stayed muted (reply ${JSON.stringify(res.text)})`);
  }
  const r = post('/request', { mode: 'stt', idleSec: 4, timeoutMs: 60000 });
  await sleep(800);
  check((await evalInPage(SPACE)).value === false, 'Space resumed');
  await sleep(1500);
  check((await evalInPage(LISTENING)).value === true, 'mic listening after resume');
  await r;
} finally {
  await post('/api/shutdown').catch(() => {});
  daemon.kill();
}
process.exit(failed ? 1 : 0);
