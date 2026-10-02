// Spec 044. Strict turns: ids, dedupe, ordering, refused unacked listen, fragment join.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { NO_SPEECH } from '../src/protocol.ts';

const PORT = 16200 + Math.floor(Math.random() * 20);
const root = new URL('..', import.meta.url);
const env = { ...process.env, STTS_PORT: String(PORT), STTS_REQUEST_TIMEOUT_MS: '20000', STTS_JOIN_SEC: '1' };
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

const post = (body) => fetch(`${base}/request`, { method: 'POST', body: JSON.stringify({ timeoutMs: 15000, ...body }) });
const say = (text, endAt = Date.now()) => ws.send(JSON.stringify({ type: 'complete', text, startAt: endAt - 500, endAt }));
const answer = async () => { const t = post({ mode: 'tts', text: 'ok' }); await wait(50); ws.send(JSON.stringify({ type: 'close' })); await t; };
const turnOf = (s) => Number(/^\[turn (\d+), heard \d\d:\d\d:\d\d to \d\d:\d\d:\d\d\] /.exec(s)?.[1]);

test('ids rise, an unanswered turn refuses the next listen, ack or tts opens it', async () => {
  let l = post({ mode: 'stt' }); await wait(100); say('first thing');
  const a = (await (await l).json()).text;
  assert.match(a, /first thing$/);
  const n = turnOf(a);
  const refused = await post({ mode: 'stt' });
  assert.equal(refused.status, 409);
  assert.match((await refused.json()).error, new RegExp(`turn ${n} is unanswered.*ack=${n}`));
  l = post({ mode: 'stt', ack: n }); await wait(100); say('second thing');
  const b = (await (await l).json()).text;
  assert.equal(turnOf(b), n + 1);
  await answer();
  l = post({ mode: 'stt' }); await wait(100); say('third thing');
  assert.equal(turnOf((await (await l).json()).text), n + 2);
  await answer();
});

test('an exact duplicate and stale speech are never returned; the listen goes on', async () => {
  const before = Date.now() - 60_000;
  const l = post({ mode: 'stt' }); await wait(100);
  say('Third thing.');          // same words as the last turn
  await wait(50);
  say('old words', before);     // captured before the last turn ended
  await wait(50);
  say('fresh words');
  const t = (await (await l).json()).text;
  assert.match(t, /\] fresh words$/);
  await answer();
});

test('the same words said again later (a second yes) are a new turn', async () => {
  await wait(1700);
  const l = post({ mode: 'stt' }); await wait(100);
  say('fresh words');
  assert.match((await (await l).json()).text, /\] fresh words$/);
  await answer();
});

test('a cut sentence is joined with its continuation into one turn', async () => {
  const l = post({ mode: 'stt' }); await wait(100);
  say('I want you to check the');
  await wait(300);
  say('deploy logs');
  const t = (await (await l).json()).text;
  assert.match(t, /\] I want you to check the deploy logs$/);
  await answer();
});

test('a cut sentence with no continuation returns as is after the join wait', async () => {
  const t0 = Date.now();
  const l = post({ mode: 'stt' }); await wait(100);
  say('and then');
  await wait(1200);
  ws.send(JSON.stringify({ type: 'nospeech' }));   // the page's short join listen heard nothing
  const t = (await (await l).json()).text;
  assert.match(t, /\] and then$/);
  assert.ok(Date.now() - t0 < 5000);
  await answer();
});

test('no speech is not a turn: the next listen is not refused', async () => {
  let l = post({ mode: 'stt' }); await wait(100);
  ws.send(JSON.stringify({ type: 'nospeech' }));
  assert.equal((await (await l).json()).text, NO_SPEECH);
  l = post({ mode: 'stt' }); await wait(100);
  ws.send(JSON.stringify({ type: 'nospeech' }));
  assert.equal((await l).status, 200);
});
