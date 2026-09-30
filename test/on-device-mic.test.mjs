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
