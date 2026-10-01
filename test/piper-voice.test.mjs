// Spec 038/039. The window speaks with Piper on this PC, one clip per sentence, rendered ahead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { segment } from '../src/sentences.ts';
import { handleVoice, installedVoices, stopPiper } from '../src/piper.ts';

const cases = [
  ["Hello there.", ["Hello there."]],
  ["Right. Okay.", ["Right.", "Okay."]],
  ["First, the plan; then: the rest! Done? Yes.", ["First, the plan; then: the rest!", "Done?", "Yes."]],
  ["It cost 1,200 dollars, or 3.5 each, at 7:35 today.", ["It cost 1,200 dollars, or 3.5 each, at 7:35 today."]],
  ["Open https://example.com/a.b?x=1, then write a.b@c.io now.", ["Open https://example.com/a.b?x=1, then write a.b@c.io now."]],
  ["   ", []],
  ["no punctuation at all but long enough", ["no punctuation at all but long enough"]],
];

test('one piece per sentence, commas kept inside, long runs capped', () => {
  for (const [input, want] of cases) {
    const got = segment(input);
    assert.deepEqual(got, want, input);
    assert.equal(got.join('').replace(/\s/g, ''), input.replace(/\s/g, ''), input);
  }
  const big = 'Sure, the numbers are 1,200 and 3.5 at 7:35; see https://x.io/a?b=1. '.repeat(70000);
  const parts = segment(big);
  assert.ok(parts.every((p) => p.length <= 400));
  assert.equal(parts.join('').replace(/\s/g, ''), big.replace(/\s/g, ''));
});

test('the page routes speech through the local daemon, Windows voice as fallback, no online voice', () => {
  for (const f of ['src/stts_ui.html', 'dist/stts_ui.html']) {
    const html = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    for (const s of ["fetch('/voice/split'", "fetch('/voice/clip?'", "fetch('/voice/voices')", 'const RENDER_AHEAD = 3;',
      'AbortSignal.timeout(25000)', 'clip watchdog', "fire(c.item.u, 'start')", 'playNative(c)', "fire(u, 'error', { error: 'interrupted' })"]) assert.ok(html.includes(s), `${f}: ${s}`);
    assert.ok(!/edge-tts|\/edge\/|Google US English'\)/.test(html), `${f}: online voice left`);
    assert.ok(html.indexOf('SS.speak = function') < html.indexOf('const origSpeak = SpeechSynthesis.prototype.speak'), f);
  }
});

test('live: voices, split, a Piper clip at 1.1x, and clean failures', { skip: !installedVoices().length && 'piper not installed' }, async () => {
  const srv = http.createServer(async (req, res) => {
    if (!(await handleVoice(req, res, new URL(req.url, 'http://x')))) { res.writeHead(404); res.end(); }
  }).listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const voices = await (await fetch(`${base}/voice/voices`)).json();
    assert.ok(voices.length >= 1 && voices.every((v) => v.lang.startsWith('en-')), JSON.stringify(voices));
    const split = await (await fetch(`${base}/voice/split`, { method: 'POST', body: 'Hello there, how are you? Fine.' })).json();
    assert.deepEqual(split, ['Hello there, how are you?', 'Fine.']);
    for (const v of voices) {
      const t0 = Date.now();
      const r = await fetch(`${base}/voice/clip?voice=${v.name}&text=${encodeURIComponent('Hello there,')}&rate=1.1`);
      assert.equal(r.status, 200, v.name);
      const wav = Buffer.from(await r.arrayBuffer());
      assert.ok(wav.length > 2000 && wav.subarray(0, 4).toString() === 'RIFF', `${v.name} ${wav.length}`);
      console.log(`${v.name}: ${wav.length} bytes in ${Date.now() - t0} ms`);
    }
    const long = 'This is a much longer sentence, to make sure a big clip renders in time. '.repeat(6);
    assert.equal((await fetch(`${base}/voice/clip?text=${encodeURIComponent(long)}`)).status, 200);
    assert.equal((await fetch(`${base}/voice/clip?text=`)).status, 502);
    assert.equal((await fetch(`${base}/voice/clip?text=hi&voice=xx-Nope`)).status, 502);
  } finally { srv.close(); stopPiper(); }
});

