// Spec 012 and 013, the page half. The code is lifted out of the real
// stts_ui.html (the pattern of echo.test.mjs) and run against stand-ins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../src/stts_ui.html', import.meta.url), 'utf8');
const src = html.match(/ {6}let idleInterim = '';[\s\S]*?stopBtn\.onclick = [^\n]*\n/);
assert.ok(src, 'spec 012/013 block not found in stts_ui.html');

function page(mode) {
  const s = {
    currentMode: mode, carry: '', flushed: '', flushedAt: 0, prov: { start: 0 }, sent: [], resets: 0, barges: 0,
    input: { value: '' }, stopBtn: {},
  };
  const scope = new Proxy(s, { has: (_, k) => k in s, get: (t, k) => t[k], set: (t, k, v) => { t[k] = v; return true; } });
  const window = {};
  const api = new Function('scope', 'window', 'fns', `with (fns) { with (scope) { ${src[0]}\n return { saveIdleInterim, setIdle: (v) => { idleInterim = v; } }; } }`)(
    scope, window, {
      stripCommands: (t) => t.replace(/\bstop it\b/gi, ' ').replace(/\s+/g, ' ').trim(),
      armBarge: () => { s.barges++; },
      clearTimeout: () => {}, pauseTimer: 0, idleTimer: 0,
      flushInterim: () => { if (s.pendingInterim) { s.input.value += ' ' + s.pendingInterim; s.pendingInterim = ''; } },
      resetToIdle: () => { s.resets++; s.currentMode = null; },
      sendSocket: (m) => s.sent.push(m),
      synth: { cancel: () => {} }, gotitBtn: {}, stopSpeaking: () => {},
    });
  return { s, window, ...api };
}

test('an idle utterance Edge never finalised is kept in carry, once', () => {
  for (let k = 0; k < 3; k++) {
    const p = page(null);
    p.s.carry = 'Thank you.';
    p.setIdle('so what I was saying at length before that');
    p.saveIdleInterim();
    p.saveIdleInterim();   // a second end or abort must not add it twice
    assert.equal(p.s.carry, 'Thank you. so what I was saying at length before that');
    assert.equal(p.s.flushed, 'so what I was saying at length before that', 'the late final is deduped against it');
    assert.equal(p.s.barges, 1);
  }
});

test('nothing interim means nothing to save', () => {
  const p = page(null);
  p.saveIdleInterim();
  assert.equal(p.s.carry, '');
  assert.equal(p.s.barges, 0);
});

test('a listen released at its bound keeps the box and the interim as carry', () => {
  const p = page('stt');
  p.s.input.value = 'a very long answer';
  p.s.pendingInterim = 'still going';
  p.window.onSttsReleased();
  assert.equal(p.s.carry, 'a very long answer still going');
  assert.equal(p.s.resets, 1);
  assert.equal(p.s.barges, 1);
});

test('release outside a listen does nothing, and an empty box adds nothing', () => {
  const idle = page(null);
  idle.s.input.value = 'old prompt';
  idle.window.onSttsReleased();
  assert.equal(idle.s.carry, '');
  const empty = page('stt');
  empty.window.onSttsReleased();
  assert.equal(empty.s.carry, '');
  assert.equal(empty.s.barges, 0);
});

test('stop during speech says stopped; stop when not speaking says nothing', () => {
  const p = page('tts');
  p.s.stopBtn.onclick();
  assert.deepEqual(p.s.sent, [{ type: 'stopped' }]);
  assert.equal(p.s.resets, 1);
  const idle = page(null);
  idle.s.stopBtn.onclick();
  assert.deepEqual(idle.s.sent, []);
});

test('the daemon side and the page side agree on the message names', () => {
  const daemon = readFileSync(new URL('../src/stts-daemon.ts', import.meta.url), 'utf8');
  assert.match(html, /msg\.type === 'released'/);
  assert.match(daemon, /type: 'released'/);
  assert.match(src[0], /sendSocket\(\{ type: 'stopped' \}\)/);
  assert.match(daemon, /case 'stopped':/);
  assert.match(html, /speakEndedAt = Date\.now\(\);\s*interruptTts\(\);/, 'talking over it (headphone mode) stops a reading');
});
