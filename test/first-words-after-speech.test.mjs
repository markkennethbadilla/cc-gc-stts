// Spec 032. With speakers (headphone mode off) the mic now stays on while the agent talks, so
// Mark's first words right after it stops are heard. The real onResult and stripEcho are lifted
// out of stts_ui.html and fed what the recognizer produces when he answers at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../src/stts_ui.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const grab = (re) => { const m = html.match(re); assert.ok(m, 'not found: ' + re); return m[0]; };
const src = [
  grab(/ {6}const norm = [^\n]*\n/),
  grab(/ {6}function stripEcho\(text\) \{[\s\S]*?\n {6}\}\n/),
  grab(/ {6}function dedupe\([^)]*\) \{[\s\S]*?\n {6}\}\n/),
  grab(/ {6}function onResult\(event\) \{[\s\S]*?\n {6}\}\n/),
].join('');

const SAID = 'Done. The build is green and pushed to main. Anything else?';
function page() {
  const s = { currentMode: 'tts', flushed: '', flushedAt: 0, rawInterim: '', pendingInterim: '', prov: null, idleInterim: '', carry: '', input: { value: '' }, echoIdx: -1 };
  const scope = new Proxy(s, { has: (_, k) => k in s, get: (t, k) => t[k], set: (t, k, v) => { t[k] = v; return true; } });
  const insert = (t) => { if (t) s.input.value += (s.input.value ? ' ' : '') + t; };
  const synth = { speaking: true };
  const fns = {
    isSpokenBack: () => false, stripTail: (t) => t, ownVoice: () => false, clearInterim: () => {}, keepCaret: () => {},
    armPause: () => {}, armBarge: () => {}, stripCommands: (t) => t, mic: {}, insert, showInterim: () => {},
    bargeIn: { checked: false }, synth, ttsTextarea: { value: SAID },
    upstreamOnResult: { call: (_, e) => insert(e.results[0][0].transcript.trim()) },
  };
  const api = new Function('scope', 'fns', `with (fns) { with (scope) { ${src}\n return { onResult, stripEcho }; } }`)(scope, fns);
  const results = [];
  const ev = (i, text, isFinal) => { results[i] = Object.assign([{ transcript: text }], { isFinal }); api.onResult({ resultIndex: i, results }); };
  return { s, synth, ev, api };
}

test('the mic is never aborted when speech starts', () => {
  assert.doesNotMatch(html, /addEventListener\('start', muteMic\)/);
  assert.doesNotMatch(html, /const muteMic/);
});

test('anything heard while the agent speaks is dropped', () => {
  const p = page();
  p.ev(0, 'done the build is green', false);
  p.ev(0, 'done the build is green and pushed to main', true);
  assert.equal(p.s.carry, '');
  assert.equal(p.s.echoIdx, 0);
});

test('an answer that runs on from the echo keeps his words, loses the echo', () => {
  const p = page();
  p.ev(0, 'anything', false);          // tail of the agent's voice
  p.synth.speaking = false;            // speech ends, Mark answers at once
  p.s.currentMode = 'stt';
  p.ev(0, 'anything else yes deploy it now', true);
  assert.equal(p.s.input.value, 'yes deploy it now');
});

test('a result that starts after speech is kept whole, even if it reuses its words', () => {
  const p = page();
  p.ev(0, 'green', true);
  p.synth.speaking = false; p.s.currentMode = 'stt';
  p.ev(1, 'the build is fine ship it', true);
  assert.equal(p.s.input.value, 'the build is fine ship it');
});

test('stripEcho edge cases', () => {
  const { api } = page();
  assert.equal(api.stripEcho(''), '');
  assert.equal(api.stripEcho('anything else?'), '');
  assert.equal(api.stripEcho('Anything, else... NO wait'), 'NO wait');
  assert.equal(api.stripEcho('totally new words'), 'totally new words');
  const long = Array(5000).fill('word').join(' ');
  assert.equal(api.stripEcho(long), long);
});
