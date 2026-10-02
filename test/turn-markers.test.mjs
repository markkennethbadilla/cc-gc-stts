// Spec 045. Turn markers: one earcon per state change, never transcribed, countdown resets on speech.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../src/stts_ui.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const grab = (re) => { const m = html.match(re); assert.ok(m, 'not found: ' + re); return m[0]; };
const lift = (names, fns, scope = {}) => {
  const src = names.map((n) => grab(n)).join('');
  const sc = new Proxy(scope, { has: (_, k) => k in scope, get: (t, k) => t[k], set: (t, k, v) => { t[k] = v; return true; } });
  return new Function('scope', 'fns', `with (fns) { with (scope) { ${src}\n return this; } }`).call({}, sc, fns);
};

function machine() {
  const played = [], spoken = [];
  const el = () => ({ textContent: '' });
  const parts = { '.tb-icon': el(), '.tb-text': el() };
  const fns = {
    EARCON: eval('(' + grab(/const EARCON = \{[^\n]*\}/).replace('const EARCON = ', '') + ')'),
    BANNER: { speak: ['g', 'Speak now'], heard: ['a', 'Heard: "%s" - working'], background: ['a', 'Background'], agent: ['b', 'Agent speaking - wait'], idle: ['x', 'Not listening'] },
    banner: { dataset: {}, querySelector: (q) => parts[q] },
    playEarcon: async (n) => { played.push(n); },
    gotitEl: { checked: false },
    speechSynthesis: { speak: (u) => spoken.push(u.text) },
    SpeechSynthesisUtterance: function (t) { this.text = t; },
  };
  const scope = { turnState: '' };
  const src = grab(/ {6}function setTurnState\([^)]*\) \{[\s\S]*?\n {6}\}\n/);
  const setTurnState = new Function('scope', 'fns', `with (fns) { with (scope) { ${src}\n return setTurnState; } }`)(
    new Proxy(scope, { has: (_, k) => k in scope, get: (t, k) => t[k], set: (t, k, v) => { t[k] = v; return true; } }), fns);
  return { setTurnState, played, spoken, fns, parts, banner: fns.banner };
}

test('every script block of the page parses', () => {
  for (const [, js] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(js);
});

test('each state change plays its marker exactly once', async () => {
  const m = machine();
  const seq = ['idle', 'speak', 'speak', 'heard', 'heard', 'agent', 'idle', 'speak', 'background', 'background', 'idle'];
  for (const s of seq) await m.setTurnState(s, s === 'heard' ? 'check the logs' : '');
  assert.deepEqual(m.played, ['listen-open', 'turn-captured', 'listen-open', 'background-result']);
  assert.equal(m.banner.dataset.state, 'idle');
});

test('banner shows the exact words heard, and green only after the chime', async () => {
  const m = machine();
  let release;
  m.fns.playEarcon = () => new Promise((r) => { release = r; });
  const p = m.setTurnState('speak');
  assert.notEqual(m.banner.dataset.state, 'speak', 'not green while the chime plays');
  release(); await p;
  assert.equal(m.banner.dataset.state, 'speak');
  m.fns.playEarcon = async () => {};
  await m.setTurnState('heard', 'check the logs');
  assert.equal(m.parts['.tb-text'].textContent, 'Heard: "check the logs" - working');
  await m.setTurnState('idle', 'Not heard: "hi"');
  assert.equal(m.parts['.tb-text'].textContent, 'Not heard: "hi"');
});

test('optional "Got it" is spoken once per captured turn', async () => {
  const m = machine();
  m.fns.gotitEl.checked = true;
  await m.setTurnState('heard', 'a'); await m.setTurnState('heard', 'a');
  assert.deepEqual(m.spoken, ['Got it']);
});

test('speech recognised while an earcon plays is never transcribed', () => {
  const s = { currentMode: 'stt', rawInterim: '', pendingInterim: '', input: { value: '' }, playIdx: -1 };
  const got = [];
  const fns = {
    synth: { speaking: false }, dedupe: (t) => t, clearInterim() {}, keepCaret() {}, armPause() {}, showInterim() {},
    mic: {}, upstreamOnResult: { call: (_, e) => got.push(e.results[0][0].transcript) }, sttStatus: {},
  };
  const src = grab(/ {6}function onResult\(event\) \{[\s\S]*?\n {6}\}\n/);
  const onResult = new Function('scope', 'fns', `with (fns) { with (scope) { ${src}\n return onResult; } }`)(
    new Proxy(s, { has: (_, k) => k in s, get: (t, k) => t[k], set: (t, k, v) => { t[k] = v; return true; } }), fns);
  const ev = (t) => onResult({ resultIndex: 0, results: [Object.assign([{ transcript: t }], { isFinal: true })] });
  globalThis.__earcon = true; ev('ding');
  globalThis.__earcon = false;
  assert.deepEqual(got, [], 'chime dropped');
  onResult({ resultIndex: 0, results: [Object.assign([{ transcript: 'ding' }], { isFinal: true }), Object.assign([{ transcript: 'hello' }], { isFinal: true })] });
  assert.deepEqual(got, ['hello'], 'the result open during the chime stays dropped, the next is heard');
});

test('the countdown pulses while he talks and restarts when he stops', () => {
  const calls = [];
  globalThis.__countdown = (ms) => calls.push(ms);
  const timers = [];
  let talking = true;
  const s = { pauseTimer: null, muted: false, currentMode: 'stt', input: { value: 'check the' }, pendingInterim: '' };
  const fns = {
    micSpeaking: () => talking, autoOn: { checked: true }, quietMs: () => 700, flushAndSend() {},
    setTimeout: (fn, ms) => { timers.push([fn, ms]); return timers.length; }, clearTimeout() {},
  };
  const src = grab(/ {6}function armPause\(\) \{[\s\S]*?\n {6}\}\n/);
  const armPause = new Function('scope', 'fns', `with (fns) { with (scope) { ${src}\n return armPause; } }`)(
    new Proxy(s, { has: (_, k) => k in s, get: (t, k) => t[k], set: (t, k, v) => { t[k] = v; return true; } }), fns);
  armPause(); armPause();      // still talking: pulse, re-check
  talking = false; armPause(); // quiet: drain over the pause window
  talking = true; armPause();  // he went on: back to pulse
  talking = false; armPause(); // and the drain starts over
  assert.deepEqual(calls, [-1, -1, 700, -1, 700]);
  delete globalThis.__countdown;
});
