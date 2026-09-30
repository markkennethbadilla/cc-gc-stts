// Spec 027. The real onResult, dedupe and flushInterim are lifted out of stts_ui.html and fed
// the sequence Edge produced live on 2026-09-30: one open result whose interim grows across two
// sends (auto-send, then the 1 s check listen), then a final in different casing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(process.env.HTML || new URL('../src/stts_ui.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const grab = (re) => { const m = html.match(re); assert.ok(m, 'not found: ' + re); return m[0]; };
const src = [
  grab(/ {6}const norm = [^\n]*\n/),
  grab(/ {6}function dedupe\([^)]*\) \{[\s\S]*?\n {6}\}\n/),
  grab(/ {6}function flushInterim\(\) \{[\s\S]*?\n {6}\}\n/),
  grab(/ {6}function onResult\(event\) \{[\s\S]*?\n {6}\}\n/),
].join('');

function page() {
  const s = { currentMode: 'stt', flushed: '', flushedAt: 0, rawInterim: '', pendingInterim: '', prov: null, idleInterim: '', carry: '', input: { value: '' } };
  const scope = new Proxy(s, { has: (_, k) => k in s, get: (t, k) => t[k], set: (t, k, v) => { t[k] = v; return true; } });
  const insert = (t) => { if (t) s.input.value += (s.input.value ? ' ' : '') + t; };
  const fns = {
    isSpokenBack: () => false, ownVoice: () => false, clearInterim: () => { s.prov = null; }, keepCaret: () => {},
    armPause: () => {}, armBarge: () => {}, stripCommands: (t) => t, mic: {}, insert,
    bargeIn: { checked: false }, synth: { speaking: false }, echoIdx: -1, stripEcho: (t) => t, stripTail: (t) => t,   // spec 032, 036
    showInterim: () => {},   // interim stays pending, sent by flushInterim (the auto-send path)
    upstreamOnResult: { call: (_, e) => insert(e.results[0][0].transcript.trim()) },
  };
  const api = new Function('scope', 'fns', `with (fns) { with (scope) { ${src}\n return { onResult, flushInterim }; } }`)(scope, fns);
  const ev = (text, isFinal) => api.onResult({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal })] });
  // One stt return: flush what is pending and hand back the box, as submit does.
  const send = () => { api.flushInterim(); const v = s.input.value; s.input.value = ''; return v; };
  return { s, ev, send };
}

const A = 'OK i answered i picked option one and option 4 and i\'m right because i\'m i\'m pretty sure that you need to abide';
const B = A + ' by you know compliance and legal';
const C = B + ' so that is why i picked them';

test('each listen returns only speech not yet delivered, never a repeat (3 runs)', () => {
  for (let k = 0; k < 3; k++) {
    const p = page();
    p.ev('OK i answered', false);
    p.ev(A, false);
    const r1 = p.send();
    assert.equal(r1, A);
    p.ev(B, false);                       // Edge re-sends the whole open result
    const r2 = p.send();
    assert.equal(r2, 'by you know compliance and legal');
    p.ev(C, false);
    p.ev('Okay, I answered. I picked option one and option 4, and I\'m right because I\'m, I\'m pretty sure that you need to abide by, you know, compliance and legal. So that is why I picked them.', true);
    const r3 = p.send();
    assert.equal(r3, 'so that is why i picked them');
    const all = norm3([r1, r2, r3].join(' '));
    assert.equal(all, norm3(C), 'every word once, none dropped');
  }
});

test('a new utterance after the final is not cut', () => {
  const p = page();
  p.ev(A, false); p.send();
  p.ev(A + ' more', true);
  assert.equal(p.send(), 'more');
  p.ev('pretty sure that you need to abide by the rules', true);
  assert.equal(p.send(), 'pretty sure that you need to abide by the rules');
});

test('a final that does not match what was sent is kept whole, not dropped', () => {
  const p = page();
  p.ev('hello there', false); p.send();
  p.ev('something else entirely', true);
  assert.equal(p.send(), 'something else entirely');
});

test('an interim Edge shortened after the send adds nothing', () => {
  const p = page();
  p.ev('one two three four', false); p.send();
  p.ev('one two three', false);
  assert.equal(p.send(), '');
});

function norm3(s) { return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).join(' '); }
