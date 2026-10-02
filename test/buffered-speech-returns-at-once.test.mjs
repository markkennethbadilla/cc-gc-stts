// Spec 042. Speech finished while the agent worked is returned the moment a
// listen opens, not after he speaks again. Real daemon, stand-in window.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { WebSocket } from 'ws';

const PORT = 16060 + Math.floor(Math.random() * 20);
const root = new URL('..', import.meta.url);
const env = { ...process.env, STTS_PORT: String(PORT), STTS_REQUEST_TIMEOUT_MS: '60000' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const url = `http://127.0.0.1:${PORT}/request`;
let daemon, ws;
const got = [];

before(async () => {
  daemon = spawn(process.execPath, ['src/stts-daemon.ts'], { cwd: root, env, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/ping`)).ok) break; } catch {}
    await wait(100);
  }
  ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => ws.once('open', r));
  ws.on('message', (raw) => got.push(JSON.parse(raw.toString())));
});
after(() => { ws?.close(); daemon?.kill(); });

const listen = () => fetch(url, { method: 'POST', body: JSON.stringify({ mode: 'stt', timeoutMs: 3000 }) });

test('several chunks said while busy come back at once, in order, and only once', async () => {
  ws.send(JSON.stringify({ type: 'barge', text: 'first thing' }));
  ws.send(JSON.stringify({ type: 'barge', text: 'second thing' }));
  await wait(100);
  got.length = 0;
  const t = Date.now();
  const r = await listen();
  assert.equal((await r.json()).text, 'first thing second thing');
  assert.ok(Date.now() - t < 1000, 'returned without waiting for new speech');
  assert.equal(got.filter((m) => m.type === 'request').length, 0, 'the window is not asked to listen');
});

test('speech kept during a tts turn comes back on the next listen at once', async () => {
  const tts = fetch(url, { method: 'POST', body: JSON.stringify({ mode: 'tts', text: 'x', timeoutMs: 3000 }) });
  await wait(100);
  ws.send(JSON.stringify({ type: 'complete', text: 'said over the voice' }));   // lands while a tts is pending
  ws.send(JSON.stringify({ type: 'close' }));
  await tts;
  const r = await listen();
  assert.equal((await r.json()).text, 'said over the voice');
});

test('page: a listen that opens with finished carry sends it at once', () => {
  const html = readFileSync(new URL('../src/stts_ui.html', import.meta.url), 'utf8');
  assert.match(html, /if \(carry\) \{ insert\(carry\); carry = ''; if \(micSpeaking\(\)\) armPause\(\); else flushAndSend\(\); \}/);
});
