// Specs 025 and 026: the window stays usable when narrow, and a helper or a test
// cannot close the live one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../src/stts_ui.html', import.meta.url), 'utf8');
const daemon = readFileSync(new URL('../src/stts-daemon.ts', import.meta.url), 'utf8');

test('a test port gets its own browser profile', () => {
  assert.match(daemon, /FIXED_PORT === 15986 \? 'profile' : `profile-\$\{FIXED_PORT\}`/);
});

test('close is honoured only for the main session', () => {
  assert.match(daemon, /p\.config\.close && \(!voiceOwner \|\| voiceOwner\.endsWith\('\|'\)\)/);
  assert.doesNotMatch(daemon, /if \(p\.config\.close\) setTimeout/);
});

test('narrow strip: no fixed minimum width, stacked panels, live words scroll into view', () => {
  assert.doesNotMatch(html, /min-width: 200px/);
  assert.match(html, /@media \(max-width: 560px\)[\s\S]*flex-direction: column/);
  assert.match(html, /@media \(max-height: 360px\)/);
  assert.equal((html.match(/input\.scrollTop = input\.scrollHeight/g) || []).length, 2);
});
