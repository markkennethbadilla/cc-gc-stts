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
    const r = post('/request', { mode: 'stt', idleSec: 3, timeoutMs: 8000 });
    let heard = false;
    for (let s = 0; s < 8; s++) { await sleep(400); if ((await evalInPage(LISTENING)).value) heard = true; }
    const res = await r;
    check(!heard, `listen ${n}/5 stayed muted (reply ${JSON.stringify(res.text)})`);
  }
  // tts with listen=true, five times: speak, then listen. Mute must hold through the speech end.
  const PAUSED = `document.getElementById('pause-btn').classList.contains('paused')`;
  const listenMuted = async () => {
    const r = post('/request', { mode: 'stt', idleSec: 3, timeoutMs: 8000 });
    let heard = false;
    for (let s = 0; s < 8; s++) { await sleep(400); if ((await evalInPage(LISTENING)).value) heard = true; }
    await r;
    return !heard && (await evalInPage(PAUSED)).value === true;
  };
  for (let n = 1; n <= 5; n++) {
    await post('/request', { mode: 'tts', title: 'Speak', text: `Mute test, part ${n}.`, oneshot: true, timeoutMs: 60000 });
    check(await listenMuted(), `tts+listen ${n}/5 stayed muted`);
  }
  // Pause during playback: resume, speak, press Space mid-speech, then listen.
  const r0 = post('/request', { mode: 'stt', idleSec: 2, timeoutMs: 60000 });
  await sleep(500);
  check((await evalInPage(SPACE)).value === false, 'Space resumed before playback test');
  await r0;
  const t = post('/request', { mode: 'tts', title: 'Speak', text: 'This is a longer sentence so that Mark can press pause while it is still being spoken aloud. And a second sentence follows it.', oneshot: true, timeoutMs: 60000 });
  await sleep(1200);
  check((await evalInPage(SPACE)).value === true, 'Space paused during playback');
  await t;
  check(await listenMuted(), 'pause made during playback held after it');
  const r = post('/request', { mode: 'stt', idleSec: 4, timeoutMs: 60000 });
  await sleep(800);
  check((await evalInPage(SPACE)).value === false, 'Space resumed');
  let back = false;
  for (let s = 0; s < 10 && !back; s++) { await sleep(500); back = (await evalInPage(LISTENING)).value === true; }
  check(back, `mic listening after resume (${JSON.stringify((await evalInPage(`[document.title, document.getElementById('tts-container').className]`)).value)})`);
  await r;
} finally {
  await post('/api/shutdown').catch(() => {});
  daemon.kill();
}
process.exit(failed ? 1 : 0);
