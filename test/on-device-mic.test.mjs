// Spec 035: on-device recognition when Chrome has it; routine errors never shown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../src/stts_ui.html', import.meta.url), 'utf8');
test('asks for on-device en-US and falls back to cloud', () => {
  assert.match(html, /processLocally: true/);
  assert.match(html, /r\.processLocally = local && !r\.__cloud/);
  assert.match(html, /language-not-supported' && this\.processLocally\) \{ this\.__cloud = true/);
});
test('network, aborted, no-speech are never shown to Mark', () => {
  assert.match(html, /\['network', 'aborted', 'no-speech'\]\.includes\(event\.error\)\) return;/);
});
test('dist/stts_ui.html (what the daemon serves) matches src', () => {
  assert.equal(readFileSync(new URL('../dist/stts_ui.html', import.meta.url), 'utf8'), html);
});
test('install() runs from the first user gesture, with a hint', () => {
  assert.match(html, /Click anywhere to enable local speech/);
  assert.match(html, /\['pointerdown', 'keydown'\]\.forEach\(t => addEventListener\(t, go, true\)\)/);
});
