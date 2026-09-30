// Spec 030. Mark paused the mic and every new listen switched it back on. The start
// wrapper is lifted out of the real stts_ui.html and driven through many listens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../src/stts_ui.html', import.meta.url), 'utf8');
const src = html.match(/SR\.prototype\.start = function \(\) \{[\s\S]*?\n {6}\};/);
assert.ok(src, 'start wrapper not found');
assert.match(html, /mic\.__paused = muted; mic\.__fatal = false;/, 'watchdog restart must keep mute');

function page() {
  const SR = function () {};
  SR.prototype.addEventListener = () => {};
  let starts = 0;
  const env = { muted: false };
  new Function('SR', 'origStart', 'env', `
    let mic = null, upstreamOnResult = null;
    const onResult = () => {}, micAlive = () => {};
    ${src[0].replace(/\bmuted\b/g, 'env.muted')}
  `)(SR, function () { starts++; }, env);
  return { rec: new SR(), env, starts: () => starts };
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

test('edge: muted before the very first listen still captures nothing', () => {
  const p = page();
  p.env.muted = true;
  for (let i = 0; i < 1000; i++) p.rec.start();
  assert.equal(p.starts(), 0);
});
