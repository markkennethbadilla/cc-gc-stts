// Spec 024. A request left held by an interrupted caller must not refuse the
// next call. Real daemon on its own port, a stand-in window on its websocket.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const PORT = 16020 + Math.floor(Math.random() * 20);
const root = new URL('..', import.meta.url);
const env = { ...process.env, STTS_PORT: String(PORT), STTS_REQUEST_TIMEOUT_MS: '60000' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const url = `http://127.0.0.1:${PORT}/request`;
let daemon, ws;
const got = [];
let onRequest = () => {};

before(async () => {
  daemon = spawn(process.execPath, ['src/stts-daemon.ts'], { cwd: root, env, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/ping`)).ok) break; } catch {}
    await wait(100);
  }
  ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => ws.once('open', r));
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); got.push(m); onRequest(m); });
});

after(() => { ws?.close(); daemon?.kill(); });

test('a held tts (caller gone quiet) is superseded; the new listen answers', async () => {
  got.length = 0;
  onRequest = () => {};                      // the window never finishes the tts: the stuck state
  const stuck = fetch(url, { method: 'POST', body: JSON.stringify({ mode: 'tts', text: 'x', oneshot: true }) });
  await wait(200);
  onRequest = (m) => { if (m.type === 'request' && m.config.mode === 'stt') ws.send(JSON.stringify({ type: 'complete', text: 'hello' })); };
  const r = await fetch(url, { method: 'POST', body: JSON.stringify({ mode: 'stt', timeoutMs: 5000 }) });
  assert.equal(r.status, 200, 'the new call must not be refused busy');
  assert.equal((await r.json()).text, 'hello');
  const old = await stuck;
  assert.equal(old.status, 504);
  assert.match((await old.json()).error, /superseded/);
});

test('a superseded listen tells the window to keep what it heard', async () => {
  got.length = 0;
  onRequest = () => {};
  const stuck = fetch(url, { method: 'POST', body: JSON.stringify({ mode: 'stt', timeoutMs: 30000 }) });
  await wait(200);
  onRequest = (m) => { if (m.type === 'request' && m.config.mode === 'tts') ws.send(JSON.stringify({ type: 'close' })); };
  const r = await fetch(url, { method: 'POST', body: JSON.stringify({ mode: 'tts', text: 'y', oneshot: true, timeoutMs: 5000 }) });
  assert.equal(r.status, 200);
  assert.equal((await stuck).status, 504);
  const i = got.findIndex((m) => m.type === 'released');
  const j = got.findLastIndex((m) => m.type === 'request');
  assert.ok(i >= 0 && i < j, 'released must reach the page before the new request');
});
