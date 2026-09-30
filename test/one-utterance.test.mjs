// Spec 022. The window cuts speech only at sentence ends, and the agent is told to write only periods.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const sentences = (t) => [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(t)]
  .map((s) => s.segment.trim()).filter(Boolean);

test('sentence cuts only, one utterance per sentence, guidance asks for periods only', () => {
  for (let round = 0; round < 3; round++) {
    for (const f of ['src/stts_ui.html', 'dist/stts_ui.html']) {
      const html = read(f);
      assert.doesNotMatch(html, /function clauses\(/, f);
      const body = html.match(/function startSpeaking\(\) \{[\s\S]*?\n {4}\}/)[0];
      assert.match(body, /new Intl\.Segmenter\('en', \{ granularity: 'sentence' \}\)\.segment\(textToSpeak\)/, f);
      assert.match(body, /sentences\.map\(\(s\) => new SpeechSynthesisUtterance\(s\)\)/, f);
      assert.match(html, /const noteEnd = \(\) => \{ if \(synth\.pending\) return;/, f);
    }
    assert.deepEqual(
      sentences('First, the plan; then: the rest, okay. It cost 1,200 at 7:35, see x.io/a. Done, thanks.'),
      ['First, the plan; then: the rest, okay.', 'It cost 1,200 at 7:35, see x.io/a.', 'Done, thanks.'],
    );
    assert.deepEqual(sentences('no period at all'), ['no period at all']);
    assert.deepEqual(sentences('   '), []);
    for (const f of ['commands/stts.md', 'commands/stts.toml', 'src/stts-mcp-server.ts']) {
      assert.match(read(f).replace(/'\s*\+\s*'/g, ''), /Use only periods, (and )?sparingly/, f);
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
