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

test('default pause is 0.7 s and the page falls back to it (spec 019)', () => {
  assert.equal(migrate(store({})), 700);
  assert.match(html, /const pauseMs = \(\) => Number\(localStorage\.getItem\(LS_AUTOSEND_MS\)\) \|\| PAUSE_DEFAULT_MS;/);
});

test('a saved old default of 3.5 s, 2 s or 1 s moves to 0.7 s once; any other value, and later choices, stay', () => {
  for (let round = 0; round < 3; round++) {
    for (const oldDefault of ['3500', '2000', '1000']) {
      const old = store({ __stts__autosend_ms: oldDefault, __stts__autosend_ms_v3: '1' });   // v3 already ran
      migrate(old);
      assert.equal(old.getItem('__stts__autosend_ms'), '700');
      old.setItem('__stts__autosend_ms', oldDefault);   // Mark picks it again on purpose
      migrate(old);
      assert.equal(old.getItem('__stts__autosend_ms'), oldDefault);
    }
    for (const v of ['1500', '2500', '4000', '300', '700']) {
      const s = store({ __stts__autosend_ms: v });
      migrate(s);
      assert.equal(s.getItem('__stts__autosend_ms'), v);
    }
    const fresh = store({});
    migrate(fresh);
    assert.equal(fresh.getItem('__stts__autosend_ms'), null);   // unset: the default applies
  }
});

// Spec 019. Speech that trails off waits the longer hold before it is sent; a finished
// sentence keeps the short pause. The page and the MCP server use the same word list.
test('an unfinished ending waits the hold; a finished one the pause; page and server agree', async () => {
  const page = new Function(`${grab(/const UNFINISHED_END = new Set\([\s\S]*?\.split\(' '\)\);/, 'UNFINISHED_END')}\n${grab(/function readsUnfinished\(text\) \{[\s\S]*?\n {6}\}/, 'readsUnfinished')}\nreturn readsUnfinished;`)();
  const { readsUnfinished: server } = await import('../src/protocol.ts');
  const quietSrc = grab(/const quietMs = \(text\) => [^\n]*/, 'quietMs');
  const quietMs = new Function('readsUnfinished', 'holdMs', 'pauseMs', `${quietSrc}\nreturn quietMs;`)(page, () => 2200, () => 700);
  for (let round = 0; round < 3; round++) {
    for (const t of ['and', 'so i was thinking', 'because the', 'we could um', 'I went to the']) {
      assert.equal(page(t), true, t);
      assert.equal(server(t), true, t);
      assert.equal(quietMs(t), 2200, t);
    }
    for (const t of ['what do you think about the budget', 'okay thanks', 'run the tests', '', 'Done.']) {
      assert.equal(page(t), false, t);
      assert.equal(server(t), false, t);
      assert.equal(quietMs(t), 700, t);
    }
  }
  assert.match(html, /pauseTimer = setTimeout\(flushAndSend, quietMs\(/);
  assert.match(html, /\}, quietMs\(carry\)\);/);
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

test('stt and tts tell the agent to listen again when a turn reads unfinished', () => {
  const server = readFileSync(new URL('../src/stts-mcp-server.ts', import.meta.url), 'utf8');
  assert.match(server, /A turn can arrive mid-thought\. If the transcript reads unfinished/);
  assert.match(server, /NO_SLEEP_NOTE \+\s*midThought\('call stt again'\)/);
  assert.match(server, /NO_SLEEP_NOTE \+\s*midThought\('listen again \(stt\)'\)/);
  for (const f of ['../skills/stts/SKILL.md', '../commands/stts.md', '../commands/stts.toml'])
    assert.match(readFileSync(new URL(f, import.meta.url), 'utf8'), /do not answer; listen again and join the pieces/, f);
});
