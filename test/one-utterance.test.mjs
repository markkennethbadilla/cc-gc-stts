// Spec 022/033. Upstream utterances per sentence (each cut into clips by the spec 038 Piper shim).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const sentences = (t) => [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(t)]
  .map((s) => s.segment.trim()).filter(Boolean);

test('sentence cuts only, one utterance per sentence, no punctuation guidance (spec 038)', () => {
  for (let round = 0; round < 3; round++) {
    for (const f of ['src/stts_ui.html', 'dist/stts_ui.html']) {
      const html = read(f);
      assert.doesNotMatch(html, /function clauses\(/, f);
      const body = html.match(/function startSpeaking\(\) \{[\s\S]*?\n {4}\}/)[0];
      assert.match(body, /new Intl\.Segmenter\('en', \{ granularity: 'sentence' \}\)\.segment\(textToSpeak\)/, f);
      assert.match(body, /sentences\.map\(\(s\) => new SpeechSynthesisUtterance\(s\)\)/, f);
      // Spec 033: a system (localService) voice speaks the whole part as one utterance.
      assert.match(body, /voice && voice\.localService \? \[textToSpeak\.trim\(\)\]\.filter\(Boolean\)/, f);
      assert.match(body, /localStorage\.getItem\('__stts__voice'\)/, f);
    }
    assert.deepEqual(
      sentences('First, the plan; then: the rest, okay. It cost 1,200 at 7:35, see x.io/a. Done, thanks.'),
      ['First, the plan; then: the rest, okay.', 'It cost 1,200 at 7:35, see x.io/a.', 'Done, thanks.'],
    );
    assert.deepEqual(sentences('no period at all'), ['no period at all']);
    assert.deepEqual(sentences('   '), []);
    for (const f of ['commands/stts.md', 'commands/stts.toml', 'src/stts-mcp-server.ts']) {
      assert.doesNotMatch(read(f).replace(/'\s*\+\s*'/g, ''), /punctuation marks/, f);
    }
  }
});

test('a 5 MB reply segments quickly and keeps every character', () => {
  const big = 'Sure the numbers are 1,200 and 3.5 at 7:35 so see https://x.io/a?b=1 then. '.repeat(70000);
  const t0 = Date.now();
  const got = sentences(big);
  assert.equal(got.join('').replace(/\s/g, ''), big.replace(/\s/g, ''));
  assert.ok(Date.now() - t0 < 20000, `took ${Date.now() - t0} ms`);
});
