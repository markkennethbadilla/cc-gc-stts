// Spec 039: the mic list needs a real mic grant, or Chrome hides every device and label.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const daemon = readFileSync(new URL('../src/stts-daemon.ts', import.meta.url), 'utf8');
const html = readFileSync(new URL('../src/stts_ui.html', import.meta.url), 'utf8');

test('Chrome is launched with a real grant, not the prompt-only auto-accept', () => {
  assert.match(daemon, /'--use-fake-ui-for-media-stream'/);
  assert.match(daemon, /'--test-type'/);   // hides the unsupported-flag infobar
});

test('the list refills when the settings popover opens', () => {
  assert.match(html, /e\.newState === 'open'\) fillMics\(\)|e\.newState === 'open' && typeof fillMics === 'function'\) fillMics\(\)/);
});
