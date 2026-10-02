// Specs 012 and 013, against the real daemon and the real MCP server, each on a
// port of its own (STTS_PORT), with a stand-in for the voice window on the
// daemon's websocket. The live window on 15986 is never touched.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { WebSocket } from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { LISTEN_CONTINUES, STOPPED, NO_SPEECH } from '../src/protocol.ts';
import { toParts, loadText, PART_CHARS } from '../src/read-aloud.ts';

const PORT = 15990 + Math.floor(Math.random() * 20);
const BUDGET = 3000;   // STTS_REQUEST_TIMEOUT_MS for this run: a whole tool call
const root = new URL('..', import.meta.url);
const env = { ...process.env, STTS_PORT: String(PORT), STTS_REQUEST_TIMEOUT_MS: String(BUDGET) };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let daemon, ws, client;
// The stand-in window: what it was asked, and how it answers each request.
const page = { got: [], onRequest: () => {} };

async function post(body) {
  const res = await fetch(`http://127.0.0.1:${PORT}/request`, { method: 'POST', body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
const send = (m) => ws.send(JSON.stringify(m));

before(async () => {
  daemon = spawn(process.execPath, ['src/stts-daemon.ts'], { cwd: root, env, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/ping`)).ok) break; } catch {}
    await wait(100);
  }
  ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => ws.once('open', r));
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    page.got.push(m);
    page.onRequest(m);
  });
  client = new Client({ name: 'test', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['src/stts-mcp-server.ts'], cwd: root.pathname.replace(/^\/([A-Za-z]:)/, '$1'), env }));
});

after(async () => {
  await client?.close();
  ws?.close();
  daemon?.kill();
});

test('a listen that reaches the bound continues, and the window is told to keep what it heard', async () => {
  page.got = []; page.onRequest = () => {};
  const t = Date.now();
  const r = await post({ mode: 'stt', timeoutMs: 400 });
  assert.equal(r.status, 200);
  assert.equal(r.body.text, LISTEN_CONTINUES);
  assert.ok(Date.now() - t < 2000);
  await wait(50);
  assert.ok(page.got.some((m) => m.type === 'released'), 'the page must be told to keep the speech');
});

// Spec 042. Speech with no listen open is not kept; the next listen waits for new speech.
test('speech said with no listen open is dropped; the next listen gets only new speech', async () => {
  for (let k = 0; k < 3; k++) {
    page.onRequest = () => {};
    send({ type: 'complete', text: `said while busy ${k}` });
    send({ type: 'barge', text: `old page chunk ${k}` });
    await wait(50);
    page.onRequest = (m) => { if (m.type === 'request') send({ type: 'complete', text: `the new answer ${k}` }); };
    const got = (await post({ mode: 'stt', timeoutMs: 2000 })).body.text;
    assert.match(got, new RegExp(`\] the new answer ${k}$`));
    const ack = Number(/turn (\d+)/.exec(got)[1]);
    page.onRequest = (m) => { if (m.type === 'request') send({ type: 'nospeech' }); };
    assert.equal((await post({ mode: 'stt', ack, timeoutMs: 2000 })).body.text, NO_SPEECH);
  }
});

test('stop during tts answers STOPPED', async () => {
  page.onRequest = (m) => { if (m.type === 'request') send({ type: 'stopped' }); };
  assert.equal((await post({ mode: 'tts', text: 'x', timeoutMs: 2000 })).body.text, STOPPED);
});

test('toParts: every word kept, in order, every part within the limit (1 MB, repeated)', () => {
  const sentence = 'The quick brown fox jumps over the lazy dog, again and again. ';
  for (const text of [sentence.repeat(17000), 'x'.repeat(5000), 'a\r\nb\rc\n' + 'word '.repeat(3000), 'Naive cafe. Um. ' + 'y '.repeat(10)]) {
    for (let k = 0; k < 3; k++) {
      const parts = toParts(text);
      assert.ok(parts.every((p) => p.length > 0 && p.length <= PART_CHARS), 'part over the limit');
      assert.equal(parts.join('').replace(/\s+/g, ''), text.replace(/\s+/g, ''));
    }
  }
  assert.deepEqual(toParts(''), []);
  assert.deepEqual(toParts('   \n '), []);
});

test('loadText: markdown loses its markup, plain text is kept as is, HTML is refused', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'stts-read-'));
  const md = path.join(dir, 'notes.md');
  writeFileSync(md, '# Chapter one\n\nIt was **dark** and [stormy](http://x).\n\n- first\n- second\n');
  const out = await loadText(md);
  assert.doesNotMatch(out, /[#*\[\]]|http/);
  assert.match(out, /Chapter one[\s\S]*It was dark and stormy[\s\S]*first[\s\S]*second/);
  const txt = path.join(dir, 'story.txt');
  writeFileSync(txt, '1. keep me * as is');
  assert.equal(await loadText(txt), '1. keep me * as is');
  await assert.rejects(() => loadText(path.join(dir, 'missing.txt')), /ENOENT/);
  await assert.rejects(() => loadText(), /text, file or url/);

  const srv = http.createServer((req, res) => {
    if (req.url === '/page') { res.setHeader('content-type', 'text/html'); res.end('<p>hi</p>'); return; }
    if (req.url === '/gone') { res.statusCode = 404; res.end(); return; }
    res.setHeader('content-type', 'text/plain'); res.end('plain words');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    assert.equal(await loadText(undefined, `${base}/t.txt`), 'plain words');
    await assert.rejects(() => loadText(undefined, `${base}/page`), /HTML page/);
    await assert.rejects(() => loadText(undefined, `${base}/gone`), /404/);
  } finally { srv.close(); }
});

// The MCP server end to end: the tool the agent calls.
const call = async (args) => (await client.callTool({ name: 'tts', arguments: args })).content.map((c) => c.text);
function speakingPage(ms, stopAt) {
  const spoken = [];
  page.onRequest = (m) => {
    if (m.type !== 'request') return;
    if (m.config.mode === 'stt') { setTimeout(() => send({ type: 'complete', text: 'my reply ' + Math.random() }), 20); return; }
    spoken.push(m.config.text);
    setTimeout(() => send({ type: spoken.length === stopAt ? 'stopped' : 'close' }), ms);
  };
  return spoken;
}
const bookFile = () => {
  const f = path.join(mkdtempSync(path.join(tmpdir(), 'stts-book-')), 'book.md');
  writeFileSync(f, Array.from({ length: 12 }, (_, i) => `## Part ${i}\n\n` + `Sentence number ${i} goes on for a while. `.repeat(30)).join('\n\n'));
  return f;
};

test('tts file: read to the end, then listen', async () => {
  const spoken = speakingPage(10);
  const f = bookFile();
  const out = await call({ file: f, listen: true });
  assert.match(out[0], /] my reply/);
  assert.match(out[1], /Read to the end \(part (\d+) of \1\)/);
  assert.equal(spoken.join(' ').replace(/\s+/g, ''), (await loadText(f)).replace(/\s+/g, ''));
});

test('tts file: stop it ends the reading and says where to resume', async () => {
  const spoken = speakingPage(10, 2);
  const out = await call({ file: bookFile(), listen: true });
  assert.equal(spoken.length, 2);
  assert.match(out[0], /] my reply/);
  assert.match(out[1], /stopped it during part 2 of \d+.*part=2/);
});

test('tts file: out of time hands back a part number instead of running past the gateway', async () => {
  const spoken = speakingPage(700);   // 700 ms a part; half of the 3 s budget is the reading cut-off
  const t = Date.now();
  const out = await call({ file: bookFile(), listen: true });
  assert.ok(Date.now() - t < BUDGET + 500, `took ${Date.now() - t}ms`);
  const m = out[0].match(/Read parts 1 to (\d+) of (\d+)\. .*part=(\d+)/);
  assert.ok(m, out[0]);
  assert.equal(Number(m[1]), spoken.length);
  assert.equal(Number(m[3]), spoken.length + 1);
  speakingPage(10);
  const rest = await call({ file: bookFile(), part: Number(m[3]) });
  assert.match(rest[0], /Read to the end/);
});

test('tts: a long answer plus its listen still returns inside the budget', async () => {
  page.onRequest = (m) => {
    if (m.type !== 'request') return;
    if (m.config.mode === 'tts') setTimeout(() => send({ type: 'close' }), 2500);   // most of the budget
    // the listen never answers: he is still talking
  };
  const t = Date.now();
  const out = await call({ text: 'short', listen: true, idleSec: 200 });
  assert.equal(out[0], LISTEN_CONTINUES);
  assert.ok(Date.now() - t < BUDGET + 500, `took ${Date.now() - t}ms`);
});

test('barge reports the window as open while it is connected (spec 015)', async () => {
  const b = await (await fetch(`http://127.0.0.1:${PORT}/barge`)).json();
  assert.equal(b.open, true);
});

test('tts: bad arguments are refused with a reason', async () => {
  for (const [args, re] of [[{}, /exactly one/], [{ text: 'a', file: 'b' }, /exactly one/], [{ file: 'Z:/no/such.txt' }, /ENOENT|no such/i], [{ text: 'a', part: 9 }, /past the end/]]) {
    const r = await client.callTool({ name: 'tts', arguments: args });
    assert.ok(r.isError, JSON.stringify(args));
    assert.match(r.content[0].text, re);
  }
});
