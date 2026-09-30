// The echo test that keeps the agent's own voice out of the prompt box, checked against the
// real source: the functions are lifted out of stts_ui.html rather than copied here, so this
// fails if the page's version drifts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../src/stts_ui.html', import.meta.url), 'utf8');
const grab = (re, what) => {
  const m = html.match(re);
  assert.ok(m, `not found in stts_ui.html: ${what}`);
  return m[0];
};
const src = [
  grab(/const STOP = new Set\([^;]+;/, 'STOP'),
  grab(/const norm = \(s\) =>[^;]+;/, 'norm'),
  grab(/const content = \(s\) =>[^;]+;/, 'content'),
  grab(/function isSpokenBack\(text\) \{[\s\S]*?\n {6}\}/, 'isSpokenBack'),
].join('\n');

// Stand-ins for the page's speech state.
let spokenText = '';
let speaking = false;
let endedAgo = 0;
const make = () => new Function(
  'synth', 'ttsTextarea', 'speakEndedAt', 'Date',
  `${src}\nreturn isSpokenBack;`,
)(
  { get speaking() { return speaking; } },
  { get value() { return spokenText; } },
  0,
  { now: () => endedAgo },
);

const agentLine = 'Every dependency is permissive, rulesync and gitleaks are MIT, and Apache two point zero does not force you to open source anything';
const check = (text) => make()(text);

test('a full sentence spoken back is dropped', () => {
  spokenText = agentLine; speaking = false; endedAgo = 3000;
  assert.equal(check(agentLine), true);
});

test('a mishearing of a third of it is still dropped', () => {
  spokenText = agentLine; endedAgo = 3000;
  assert.equal(check('every dependency is permissive rulesync and gitleaks are MIT'), true);
});

test('a short human reply is never dropped', () => {
  spokenText = agentLine; endedAgo = 500;
  for (const reply of ['yeah', 'no', 'okay sure', 'yes it does', 'MIT']) {
    assert.equal(check(reply), false, reply);
  }
});

test('a real answer that reuses some of the words is kept', () => {
  spokenText = agentLine; endedAgo = 1000;
  assert.equal(check('I want to close source it and charge money for hosting'), false);
});

test('nothing is dropped long after the agent stopped talking', () => {
  spokenText = agentLine; speaking = false; endedAgo = 25000;
  assert.equal(check(agentLine), false);
});

test('an echo heard while still speaking is dropped whatever the clock says', () => {
  spokenText = agentLine; speaking = true; endedAgo = 999999;
  assert.equal(check(agentLine), true);
});

test('empty and junk input never throw', () => {
  spokenText = agentLine; speaking = false; endedAgo = 1000;
  for (const junk of ['', '   ', '...', '?!']) assert.equal(check(junk), false, JSON.stringify(junk));
});

test('a long reply with no overlap is kept', () => {
  spokenText = agentLine; endedAgo = 1000;
  assert.equal(check('lets build the onboarding machine for small agencies tonight instead'), false);
});
