// Spec 036: the agent's last words, closed as a new result after the voice stops, are cut.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../src/stts_ui.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const grab = (re) => { const m = html.match(re); assert.ok(m, 'not found: ' + re); return m[0]; };
const src = grab(/ {6}const norm = [^\n]*\n/) + grab(/ {6}function stripTail\(text\) \{[\s\S]*?\n {6}\}\n/);
function mk(said, endedAgo) {
  const env = { synth: { speaking: false }, speakEndedAt: Date.now() - endedAgo, ttsTextarea: { value: said } };
  return new Function('env', `with (env) { ${src}; return stripTail; }`)(env);
}
const SAID = 'The fix is live. Reopen the window, click once, then say hello.';
test('echo of the last clip is dropped', () => {
  const f = mk(SAID, 800);
  assert.equal(f('Then say hello'), '');
  assert.equal(f('then say hello.'), '');
  assert.equal(f('say hello'), '');
});
test("Mark's words after the echo are kept", () => {
  assert.equal(mk(SAID, 800)('then say hello it works'), 'it works');
});
test('real replies are kept', () => {
  const f = mk(SAID, 800);
  assert.equal(f('yes it works now'), 'yes it works now');
  assert.equal(f(''), '');
});
test('after 5 s nothing is cut', () => {
  assert.equal(mk(SAID, 6000)('then say hello'), 'then say hello');
});
