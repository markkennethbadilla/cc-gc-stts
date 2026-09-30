// Spec 034. The window speaks through Microsoft's online voices the call bot's way: cut at
// every punctuation mark (same table as weassist-callbot segment.test.mjs, rule 67), rendered
// by edge-tts-universal in the daemon, silence trimmed by Edge's word timings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { segment } from '../src/clauses.ts';
import { handleEdge } from '../src/edge.ts';

const cases = [
  ["Hello there.", ["Hello there."]],
  ["Right. Okay.", ["Right.", "Okay."]],
  ["First, the plan; then: the rest! Done? Yes.", ["First,", "the plan;", "then:", "the rest!", "Done?", "Yes."]],
  ["It cost 1,200 dollars, or 3.5 each, at 7:35 today.", ["It cost 1,200 dollars,", "or 3.5 each,", "at 7:35 today."]],
  ["Open https://example.com/a.b?x=1, then write a.b@c.io now.", ["Open https://example.com/a.b?x=1,", "then write a.b@c.io now."]],
  ["Mr. Smith and Dr. Jones met at 10:30 a.m. today, e.g. here.", ["Mr. Smith and Dr. Jones met at 10:30 a.m. today,", "e.g. here."]],
  ["John F. Kennedy, the U.S. president, spoke.", ["John F. Kennedy,", "the U.S. president,", "spoke."]],
  ["Wait... then it stopped - really - and so on.", ["Wait...", "then it stopped", "- really", "- and so on."]],
  ["It was (mostly) fine and \"quoted, here\" too.", ["It was", "(mostly)", "fine and", "\"quoted,", "here\"", "too."]],
  ["one—two | three a|b and/or 50/50 odds", ["one—", "two", "| three a|", "b and/", "or 50/50 odds"]],
  ["Items:\n- first\n* second\n• third", ["Items:", "- first", "* second", "• third"]],
  ["   ", []],
  ["no punctuation at all but long enough", ["no punctuation at all but long enough"]],
];

test('cuts at every punctuation mark, never inside a number, URL or abbreviation', () => {
  for (const [input, want] of cases) {
    const got = segment(input);
    assert.deepEqual(got, want, input);
    assert.equal(got.join('').replace(/\s/g, ''), input.replace(/\s/g, ''), input);
  }
  const big = 'Sure, the numbers are 1,200 and 3.5 at 7:35; see https://x.io/a?b=1. '.repeat(70000);
  const parts = segment(big);
  assert.ok(parts.every((p) => p.length <= 300));
  assert.equal(parts.join('').replace(/\s/g, ''), big.replace(/\s/g, ''));
});

test('the page routes speech through the daemon and keeps the browser voice as fallback', () => {
  for (const f of ['src/stts_ui.html', 'dist/stts_ui.html']) {
    const html = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    for (const s of ["fetch('/edge/split'", "fetch('/edge/clip?'", "fetch('/edge/voices')", 'const RENDER_AHEAD = 3;',
      "fire(c.item.u, 'start')", 'playNative(c)', "fire(u, 'error', { error: 'interrupted' })"]) assert.ok(html.includes(s), `${f}: ${s}`);
    // The shim is installed before the fork's own speak wrappers capture speak.
    assert.ok(html.indexOf('SS.speak = function') < html.indexOf('const origSpeak = SpeechSynthesis.prototype.speak'), f);
  }
});

test('live: voices, split, a trimmed clip, and a clean failure', async () => {
  const srv = http.createServer(async (req, res) => {
    if (!(await handleEdge(req, res, new URL(req.url, 'http://x')))) { res.writeHead(404); res.end(); }
  }).listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const voices = await (await fetch(`${base}/edge/voices`)).json();
    assert.ok(voices.length > 20 && voices.every((v) => v.lang.startsWith('en-')), `${voices.length} voices`);
    assert.ok(voices.some((v) => v.name === 'en-US-AvaMultilingualNeural'));
    const split = await (await fetch(`${base}/edge/split`, { method: 'POST', body: 'Hello there, how are you? Fine.' })).json();
    assert.deepEqual(split, ['Hello there,', 'how are you?', 'Fine.']);
    const t0 = Date.now();
    const r = await fetch(`${base}/edge/clip?text=${encodeURIComponent('Hello there,')}&rate=1.3`);
    assert.equal(r.status, 200);
    const mp3 = Buffer.from(await r.arrayBuffer());
    const from = Number(r.headers.get('x-speech-from')), to = Number(r.headers.get('x-speech-to'));
    assert.ok(mp3.length > 2000 && from > 0 && to > from, `bytes ${mp3.length} from ${from} to ${to}`);
    console.log(`clip ${mp3.length} bytes in ${Date.now() - t0} ms, speech ${from}-${to} s`);
    assert.equal((await fetch(`${base}/edge/clip?text=`)).status, 502);
    assert.equal((await fetch(`${base}/edge/clip?text=hi&voice=xx-Nope`)).status, 502);
  } finally { srv.close(); }
});
