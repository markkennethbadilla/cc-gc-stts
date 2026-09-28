// Spec 014, live. Runs a daemon of its own (STTS_PORT) with a throwaway browser
// profile, opens the real window, and checks that a gap with no request pending
// never ends the conversation, including when the words "end conversation" are
// heard in that gap. Opens a window and speaks, so it is not in the unit suite:
//   node build.mjs && node test/window-stays-open.live.mjs [gapSeconds ...]
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

// Speech arriving between calls lands in the box the same way a transcript does.
const SAY = `(() => { const i = document.getElementById('prompt-input'); i.focus();
  document.execCommand('insertText', false, ' so let us see if this will end conversation now'); return document.title; })()`;

let failed = 0;
try {
  for (let i = 0; i < 80 && !(await alive()); i++) await sleep(100);
  for (const gap of gaps) {
    const tts = await post('/request', { mode: 'tts', text: 'Gap test.', oneshot: true, timeoutMs: 60000 });
    await sleep(1000);
    await evalInPage(SAY);                       // "end conversation" heard with nothing pending
    await sleep(gap * 1000);                     // no request pending for the whole gap
    const stt = await post('/request', { mode: 'stt', idleSec: 3, timeoutMs: 60000 }).catch((e) => ({ status: 0, text: e.code }));
    const page = await evalInPage('document.title');
    const ok = tts.status === 200 && stt.status === 200 && stt.text !== '__STTS_CONVERSATION_ENDED__'
      && (await alive()) && !page.gone && page.value !== 'Conversation ended';
    if (!ok) failed++;
    console.log(`[${ok ? 'OK' : 'FAIL'}] gap ${gap}s: stt=${JSON.stringify(stt.text)} daemon=${await alive()} title=${JSON.stringify(page.value)}`);
  }
} finally {
  await post('/api/shutdown').catch(() => {});
  daemon.kill();
}
process.exit(failed ? 1 : 0);
