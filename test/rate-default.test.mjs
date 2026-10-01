// Spec 021. The voice speaks at 1.1x by default; a rate left at an old default
// (1 or 1.3) moves to 1.1 once, and any rate Mark chose himself is kept. The code is
// lifted out of the real stts_ui.html (the pattern of echo.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../src/stts_ui.html', import.meta.url), 'utf8');
const src = html.match(/ {6}const RATE_DEFAULT = [\s\S]*?const rate = \(\) => [^\n]*\n/);
assert.ok(src, 'rate block not found in stts_ui.html');

function load(saved) {
  const m = new Map(Object.entries(saved));
  const localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  const rate = new Function('localStorage', 'LS_RATE', `${src[0]}\nreturn rate;`)(localStorage, '__stts__rate');
  return { rate, m };
}

test('rate: 1.1 by default, old default migrated once, chosen rates kept', () => {
  for (let round = 0; round < 3; round++) {
    assert.equal(load({}).rate(), 1.1);
    assert.equal(load({ __stts__rate: '1' }).rate(), 1.1);
    assert.equal(load({ __stts__rate: '1.3' }).rate(), 1.1);
    assert.equal(load({ __stts__rate: '1.6' }).rate(), 1.6);
    assert.equal(load({ __stts__rate: '0.8' }).rate(), 0.8);
    // After the one move, a 1 he sets himself stays 1.
    assert.equal(load({ __stts__rate: '1', __stts__rate_v3: '1' }).rate(), 1);
    assert.equal(load({ __stts__rate: '1.3', __stts__rate_v3: '1' }).rate(), 1.3);
    // Out-of-range and junk values are clamped or fall back.
    assert.equal(load({ __stts__rate: '9' }).rate(), 2);
    assert.equal(load({ __stts__rate: 'abc' }).rate(), 1.1);
  }
});
