// Spec 011. A listen whose recognizer died silently ran to the 240 s timeout while the
// mic icon said listening (2026-09-28, five times). micVerdict is lifted out of the real
// stts_ui.html, the way the echo and idle tests do it, and fed the states a dead or
// stalled recognizer leaves behind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../src/stts_ui.html', import.meta.url), 'utf8');
const daemon = readFileSync(new URL('../src/stts-daemon.ts', import.meta.url), 'utf8');

const src = html.match(/function micVerdict\(s\) \{[\s\S]*?\n {6}\}/);
assert.ok(src, 'micVerdict not found in stts_ui.html');
const micVerdict = new Function(`${src[0]}\nreturn micVerdict;`)();

const T = 1_000_000;
const listening = (over = {}) => ({
  mode: 'stt', muted: false, silenceStop: false, speaking: false,
  running: true, endedAt: 0, speechAt: 0, resultAt: 0, heardAt: T, now: T, ...over,
});

test('a healthy listen is left alone', () => {
  assert.equal(micVerdict(listening({ now: T + 5000 })), null);
});

test('recognizer ended mid-listen (onend/onerror) and nothing restarted it: restart', () => {
  assert.match(micVerdict(listening({ running: false, endedAt: T, now: T + 7000 })), /not running/);
});

test('just ended: the end hook gets its backoff window first', () => {
  assert.equal(micVerdict(listening({ running: false, endedAt: T, now: T + 2000 })), null);
});

test('wedged: still "running" but no audio and no words for 15 s: restart', () => {
  assert.match(micVerdict(listening({ now: T + 16000 })), /no audio or words/);
});

test('speech heard but no words written for 8 s: restart', () => {
  assert.match(micVerdict(listening({ speechAt: T, resultAt: T - 1, now: T + 9000 })), /no words for 8s/);
});

test('speech with words still arriving is not touched', () => {
  assert.equal(micVerdict(listening({ speechAt: T, resultAt: T + 8500, heardAt: T + 8500, now: T + 9000 })), null);
});

test('never outside a listen, while paused by Space, while the agent speaks, or with stop-on-silence', () => {
  const dead = { running: false, endedAt: T, now: T + 60000, heardAt: T };
  assert.equal(micVerdict(listening({ ...dead, mode: 'tts' })), null);
  assert.equal(micVerdict(listening({ ...dead, mode: null })), null);
  assert.equal(micVerdict(listening({ ...dead, muted: true })), null);
  assert.equal(micVerdict(listening({ ...dead, speaking: true })), null);
  assert.equal(micVerdict(listening({ ...dead, silenceStop: true })), null);
});

test('the watchdog clears a stale speech pause and logs every restart', () => {
  const wd = html.match(/setInterval\(\(\) => \{\s*if \(!mic\) return;[\s\S]*?\}, 2000\);/);
  assert.ok(wd, 'spec 011 watchdog not found');
  assert.match(wd[0], /mic\.__paused = false/);
  assert.match(wd[0], /micLog\(`mic restart/);
  assert.match(wd[0], /mic\.start\(\)/);
});

test('recognizer errors are logged and widen the end-hook restart delay, capped at 5 s', () => {
  assert.match(html, /e\.error !== 'aborted'\) \{ errStreak\+\+; micLog\(/);
  assert.match(html, /retry\(Math\.min\(100 \* 2 \*\* errStreak, 5000\)\)/);
  assert.match(html, /lastResultAt = heardAt = Date\.now\(\); errStreak = 0;/);
});

test('the daemon writes page log lines to daemon.log (stderr)', () => {
  assert.match(daemon, /case 'log':[\s\S]*?console\.error\(`\$\{new Date\(\)\.toISOString\(\)\} page /);
});
