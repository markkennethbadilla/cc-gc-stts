// Spec 043. A finished background agent ends an open listen at once.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import { BACKGROUND_RESULT } from '../src/protocol.ts';

const PORT = 16100 + Math.floor(Math.random() * 20);
const root = new URL('..', import.meta.url);
const env = { ...process.env, STTS_PORT: String(PORT), STTS_REQUEST_TIMEOUT_MS: '60000' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const base = `http://127.0.0.1:${PORT}`;
let daemon, ws;
const got = [];

before(async () => {
  daemon = spawn(process.execPath, ['src/stts-daemon.ts'], { cwd: root, env, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/api/ping`)).ok) break; } catch {}
    await wait(100);
  }
  ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => ws.once('open', r));
  ws.on('message', (raw) => got.push(JSON.parse(raw.toString())));
});
after(() => { ws?.close(); daemon?.kill(); });

const hook = () => spawnSync(process.execPath, ['hooks/notify-listen.mjs'], { cwd: root, env, input: '{}' });

test('the hook ends an open listen with the marker and the page keeps his words', async () => {
  for (let k = 0; k < 3; k++) {
    got.length = 0;
    const t = Date.now();
    const listen = fetch(`${base}/request`, { method: 'POST', body: JSON.stringify({ mode: 'stt', timeoutMs: 20000 }) });
    await wait(150);
    assert.equal(hook().status, 0);
    assert.equal((await (await listen).json()).text, BACKGROUND_RESULT);
    assert.ok(Date.now() - t < 3000, 'returned at once');
    assert.ok(got.some((m) => m.type === 'released'), 'page told to keep half-said words');
  }
});

test('no listen open, or a tts playing: notify changes nothing', async () => {
  assert.deepEqual(await (await fetch(`${base}/notify`, { method: 'POST' })).json(), { interrupted: false });
  const tts = fetch(`${base}/request`, { method: 'POST', body: JSON.stringify({ mode: 'tts', text: 'x', timeoutMs: 3000 }) });
  await wait(100);
  assert.deepEqual(await (await fetch(`${base}/notify`, { method: 'POST' })).json(), { interrupted: false });
  ws.send(JSON.stringify({ type: 'close' }));
  assert.equal((await tts).status, 200);
});

test('hook exits 0 with no daemon, and skips internal agents (empty agent_type)', () => {
  const r = spawnSync(process.execPath, ['hooks/notify-listen.mjs'], { cwd: root, env: { ...env, STTS_PORT: '1' } });
  assert.equal(r.status, 0);
  const cfg = JSON.parse(readFileSync(new URL('../hooks/hooks.json', import.meta.url), 'utf8'));
  const m = new RegExp(cfg.hooks.SubagentStop[0].matcher);
  assert.ok(m.test('general-purpose') && !m.test(''));
});
