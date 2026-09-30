// Spec 029. A tts request's rate and volume apply to this window only, clamped, and are
// never written to local storage. applyLive is lifted out of the real stts_ui.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../src/stts_ui.html', import.meta.url), 'utf8');
const src = html.match(/ {6}const live = \{[\s\S]*?\n {6}function applyLive\(config\) \{[\s\S]*?\n {6}\}/);
assert.ok(src, 'applyLive not found in stts_ui.html');
assert.match(html, /u\.rate = live\.rate \?\? rate\(\)/, 'speak must prefer the live rate');
assert.match(html, /u\.volume = live\.volume/, 'speak must apply the live volume');

test('live rate and volume: kept per window, clamped, never saved', () => {
  for (let round = 0; round < 3; round++) {
    const applyLive = new Function(`${src[0]}\nreturn applyLive;`)();
    assert.deepEqual(applyLive({}), { rate: null, volume: null });
    assert.deepEqual(applyLive({ rate: 1.6 }), { rate: 1.6, volume: null });
    // A later request without them keeps what was set.
    assert.deepEqual(applyLive({ text: 'hi' }), { rate: 1.6, volume: null });
    assert.deepEqual(applyLive({ rate: 9, volume: -1 }), { rate: 2, volume: 0 });
    assert.deepEqual(applyLive({ rate: 0.1, volume: 0.4 }), { rate: 0.5, volume: 0.4 });
    assert.deepEqual(applyLive({ rate: 'fast', volume: NaN }), { rate: 0.5, volume: 0.4 });
    assert.doesNotMatch(src[0], /localStorage/);
  }
});
