// Spec 010. A listen must give the agent its turn back when nobody speaks, or the
// agent cannot relay background results it promised (181 s of shared silence on
// 2026-09-28). armIdle is lifted out of the real stts_ui.html, the way the echo
// test does it, and run against stand-ins for the page's speech state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NO_SPEECH, CONVERSATION_ENDED, DEFAULT_IDLE_SEC } from '../src/protocol.ts';

const html = readFileSync(new URL('../src/stts_ui.html', import.meta.url), 'utf8');
const daemon = readFileSync(new URL('../src/stts-daemon.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../src/stts-mcp-server.ts', import.meta.url), 'utf8');

const src = html.match(/let idleTimer = null;\s*function armIdle\(sec\) \{[\s\S]*?\n {6}\}/);
assert.ok(src, 'armIdle not found in stts_ui.html');

function page() {
  const s = { mode: 'stt', value: '', interim: '', speaking: false, sent: [], resets: 0 };
  // Sloppy-mode `with` lets the lifted code read currentMode and pendingInterim live.
  const armIdle = new Function(
    'scope', 'input', 'micSpeaking', 'sendSocket', 'resetToIdle',
    `with (scope) { ${src[0]}\nreturn armIdle; }`,
  )(
    { get currentMode() { return s.mode; }, get pendingInterim() { return s.interim; } },
    { get value() { return s.value; } },
    () => s.speaking,
    (m) => s.sent.push(m),
    () => { s.resets++; s.mode = null; },
  );
  return { s, armIdle };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('silence answers nospeech once and goes idle, without closing anything', async () => {
  const { s, armIdle } = page();
  armIdle(0.1);
  await wait(250);
  assert.deepEqual(s.sent, [{ type: 'nospeech' }]);
  assert.equal(s.resets, 1);
});

test('text in the box means he is answering: no nospeech', async () => {
  const { s, armIdle } = page();
  armIdle(0.1);
  s.value = 'hello';
  await wait(250);
  assert.deepEqual(s.sent, []);
});

test('interim speech also counts as answering', async () => {
  const { s, armIdle } = page();
  armIdle(0.1);
  s.interim = 'hel';
  await wait(250);
  assert.deepEqual(s.sent, []);
});

test('speaking at the deadline defers it, then fires once he stops with nothing', async () => {
  const { s, armIdle } = page();
  s.speaking = true;
  armIdle(0.1);
  await wait(300);
  assert.deepEqual(s.sent, [], 'must not cut him off mid-speech');
  s.speaking = false;
  await wait(1200);
  assert.deepEqual(s.sent, [{ type: 'nospeech' }]);
});

test('0 or a missing idleSec waits for him, as before', async () => {
  for (const v of [0, undefined, -1]) {
    const { s, armIdle } = page();
    armIdle(v);
    await wait(150);
    assert.deepEqual(s.sent, [], `idleSec ${v}`);
  }
});

test('a turn that already ended (mode changed) sends nothing', async () => {
  const { s, armIdle } = page();
  armIdle(0.1);
  s.mode = 'tts';
  await wait(250);
  assert.deepEqual(s.sent, []);
});

test('the daemon answers nospeech with the marker, for stt only', () => {
  const at = daemon.indexOf("case 'nospeech':");
  assert.ok(at > -1, "the daemon does not handle 'nospeech'");
  const branch = daemon.slice(at, daemon.indexOf('return;', at));
  assert.match(branch, /mode === 'stt'/);
  assert.match(branch, /resolvePending\(NO_SPEECH\)/);   // spec 042: nothing is buffered
});

test('the marker is ASCII, unmistakable, and not the end marker', () => {
  assert.match(NO_SPEECH, /^__[A-Z_]+__$/);
  assert.notEqual(NO_SPEECH, CONVERSATION_ENDED);
  // Spec 017: the schema maximum, and still inside the 240 s call budget.
  assert.equal(DEFAULT_IDLE_SEC, 200);
  assert.ok(DEFAULT_IDLE_SEC * 1000 < 240_000);
});

test('both tools pass idleSec and explain the marker', () => {
  assert.match(server, /idleSec: idle \?\? DEFAULT_IDLE_SEC/);
  assert.equal((server.match(/NO_SPEECH_NOTE/g) || []).length, 3, 'defined once, used by stt and tts');
});

test('spec 017/023: default idleSec for normal waits; only an unfinished turn uses a short one', () => {
  for (const f of ['../src/stts-mcp-server.ts', '../commands/stts.md', '../commands/stts.toml', '../skills/stts/SKILL.md']) {
    const t = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(t, /short idleSec \(about/, f);
    assert.match(t, /Use the default idleSec for every normal wait/, f);
  }
});
