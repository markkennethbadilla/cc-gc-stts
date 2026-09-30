// Spec 030. Mark paused the mic and every new listen, and every spoken reply, switched it
// back on. The real start wrapper and the one start gate are
// lifted out of stts_ui.html and driven through listens and replies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../src/stts_ui.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const grab = (re, what) => { const m = html.match(re); assert.ok(m, what + ' not found'); return m[0]; };
const wrapper = grab(/SR\.prototype\.start = function \(\) \{[\s\S]*?\n {6}\};/, 'start wrapper');
const gate = grab(/function micMayRun[\s\S]*?\n {6}function startMic[\s\S]*?\n {6}\}\n/, 'start gate');

test('one gate: the raw start is called in exactly one place', () => {
  assert.equal(html.match(/origStart\.call\(/g).length, 1);
  assert.match(html, /mic\.__paused = muted; mic\.__fatal = false;/, 'watchdog restart must keep mute');
});

function page() {
  const SR = function () {};
  SR.prototype.addEventListener = () => {};
  let starts = 0;
  const env = { muted: false, aborts: 0 };
  const synth = { pending: false };
  const api = new Function('SR', 'origStart', 'env', 'synth', `
    let mic = null, upstreamOnResult = null;
    const onResult = () => {}, micAlive = () => {}, saveIdleInterim = () => {}, origAbort = () => { env.aborts++; };
    const navigator = { mediaDevices: { getUserMedia: () => new Promise(() => {}) } }, micLog = () => {};
    ${gate.replace(/\bmuted\b/g, 'env.muted')}
    ${wrapper.replace(/\bmuted\b/g, 'env.muted')}
    return {};
  `)(SR, function () { starts++; }, env, synth);
  return { rec: new SR(), env, synth, starts: () => starts, ...api };
}

test('muted: 5 consecutive listens never start the mic, then unmute starts it (x3)', () => {
  for (let run = 0; run < 3; run++) {
    const p = page();
    p.rec.start();
    assert.equal(p.starts(), 1);
    p.env.muted = true;
    for (let i = 0; i < 5; i++) p.rec.start();
    assert.equal(p.starts(), 1, 'a listen restarted a muted mic');
    assert.equal(p.rec.__paused, true);
    assert.equal(p.rec.__wanted, true, 'listen still wants the mic for after unmute');
    p.env.muted = false;
    p.rec.start();
    assert.equal(p.starts(), 2);
  }
});


test('edge/stress: muted before the first listen, 1000 listens capture nothing', () => {
  const p = page();
  p.env.muted = true;
  for (let i = 0; i < 1000; i++) p.rec.start();
  assert.equal(p.starts(), 0);
});
