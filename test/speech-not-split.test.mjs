// Spec 019. The pause default and its one-time migration, the no-wait recognizer restart, and
// the own-voice filter that keeps everything else, lifted out of the real stts_ui.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../src/stts_ui.html', import.meta.url), 'utf8');
const grab = (re, what) => { const m = html.match(re); assert.ok(m, `not found: ${what}`); return m[0]; };

const migrateSrc = [grab(/const PAUSE_DEFAULT_MS = \d+;/, 'PAUSE_DEFAULT_MS'),
  grab(/function migratePause\(ls\) \{[\s\S]*?\n {6}\}/, 'migratePause')].join('\n');
const store = (init) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};
const migrate = (ls) => new Function('LS_AUTOSEND_MS', `${migrateSrc}\nmigratePause(arguments[1]); return PAUSE_DEFAULT_MS;`)('__stts__autosend_ms', ls);

test('default pause is 3.5 s and the page falls back to it', () => {
  assert.equal(migrate(store({})), 3500);
  assert.match(html, /const pauseMs = \(\) => Number\(localStorage\.getItem\(LS_AUTOSEND_MS\)\) \|\| PAUSE_DEFAULT_MS;/);
});

test('a saved old default of 2 s moves to 3.5 s once; any other value, and later choices, stay', () => {
  for (let round = 0; round < 3; round++) {
    const old = store({ __stts__autosend_ms: '2000' });
    migrate(old);
    assert.equal(old.getItem('__stts__autosend_ms'), '3500');
    old.setItem('__stts__autosend_ms', '2000');   // Mark picks 2 s again on purpose
    migrate(old);
    assert.equal(old.getItem('__stts__autosend_ms'), '2000');
    for (const v of ['1500', '2500', '4000', '300']) {
      const s = store({ __stts__autosend_ms: v });
      migrate(s);
      assert.equal(s.getItem('__stts__autosend_ms'), v);
    }
    const fresh = store({});
    migrate(fresh);
    assert.equal(fresh.getItem('__stts__autosend_ms'), null);   // unset: the default applies
  }
});

test('a recognizer that ends restarts at once; only rapid repeat failures back off, capped at 2 s', () => {
  const restartDelay = new Function(`${grab(/function restartDelay\(n\) \{[^\n]*\}/, 'restartDelay')}\nreturn restartDelay;`)();
  assert.equal(restartDelay(0), 0);
  assert.equal(restartDelay(1), 0);
  assert.equal(restartDelay(2), 250);
  assert.equal(restartDelay(3), 500);
  for (const n of [5, 6, 50, 1000]) assert.equal(restartDelay(n), 2000);
});

const agent = 'Every dependency is permissive, rulesync and gitleaks are MIT';
const ownVoiceSrc = [grab(/const STOP = new Set\([^;]+;/, 'STOP'), grab(/const norm = \(s\) =>[^;]+;/, 'norm'),
  grab(/const content = \(s\) =>[^;]+;/, 'content'), grab(/function ownVoice\(text\) \{[\s\S]*?\n {6}\}/, 'ownVoice')].join('\n');
const ownVoice = (text, headphones = true) => new Function('synth', 'ttsTextarea', 'speakEndedAt', 'Date', 'bargeIn', `${ownVoiceSrc}\nreturn ownVoice;`)(
  { speaking: true }, { value: agent }, 0, { now: () => 0 }, { checked: headphones })(text);

test('during the agent\'s turn only its own words are dropped; short or unfinished words from Mark are kept', () => {
  for (const mine of ['rulesync and gitleaks', 'every dependency is permissive', 'MIT', '']) assert.equal(ownVoice(mine), true, mine);
  for (const his of ['yeah', 'stop', 'mm-hmm', 'wait', 'what about pricing', 'hang on']) assert.equal(ownVoice(his), false, his);
  assert.equal(ownVoice('what about pricing', false), true);   // speakers: the mic is the agent while it talks
});
