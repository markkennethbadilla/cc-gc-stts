// Spec 037: the recognizer is started on the echo-cancelled mic track once it is live, and on the
// default mic before that. The real startMic and the getUserMedia constraints are lifted from the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../src/stts_ui.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const src = html.match(/ {6}function startMic\(r\) \{[\s\S]*?\n {6}\}\n/)[0];
const run = (track) => {
  const calls = [];
  const startMic = new Function('micMayRun', 'local', 'aecTrack', 'origStart', `${src}; return startMic;`)(
    () => true, false, track, function (...a) { calls.push(a); });
  startMic({});
  return calls[0];
};
test('live echo-cancelled track is handed to the recognizer', () => {
  const t = { readyState: 'live' };
  assert.deepEqual(run(t), [t]);
});
test('no track yet, or an ended one: default mic', () => {
  assert.deepEqual(run(null), []);
  assert.deepEqual(run({ readyState: 'ended' }), []);
});
test('all three browser processing stages are asked for', () => {
  assert.match(html, /getUserMedia\(\{ audio: \{ echoCancellation: true, noiseSuppression: true, autoGainControl: true, \.\.\./);
});
test('no text echo filter is left', () => {
  for (const f of ['stripEcho', 'stripTail', 'isSpokenBack', 'ownVoice', 'bargeIn']) assert.ok(!html.includes(f), f);
});
test('fallback: results are discarded while the voice plays and by index after, never by text', () => {
  assert.match(html, /if \(synth\.speaking\) \{ playIdx = event\.results\.length - 1; return; \}/);
  assert.match(html, /for \(let i = Math\.max\(event\.resultIndex, playIdx \+ 1\);/);
  assert.match(html, /endedAt = Date\.now\(\); playIdx = -1;/);
});
