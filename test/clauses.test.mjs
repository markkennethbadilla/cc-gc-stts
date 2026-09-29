// Spec 020. The speech splitter, lifted out of the real stts_ui.html. The same case table is in
// weassist-callbot segment.test.mjs (rule 67).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../src/stts_ui.html', import.meta.url), 'utf8');
const src = html.match(/ {4}function clauses\(text\) \{[\s\S]*?\n {4}\}/);
assert.ok(src, 'clauses() not found in stts_ui.html');
const clauses = new Function(`${src[0]}\nreturn clauses;`)();

const cases = [
  ['Hello there.', ['Hello there.']],
  ['Right. Okay.', ['Right.', 'Okay.']],
  ['First, the plan; then: the rest! Done? Yes.', ['First,', 'the plan;', 'then:', 'the rest!', 'Done?', 'Yes.']],
  ['It cost 1,200 dollars, or 3.5 each, at 7:35 today.', ['It cost 1,200 dollars,', 'or 3.5 each,', 'at 7:35 today.']],
  ['Open https://example.com/a.b?x=1, then write a.b@c.io now.', ['Open https://example.com/a.b?x=1,', 'then write a.b@c.io now.']],
  ['Mr. Smith and Dr. Jones met at 10:30 a.m. today, e.g. here.', ['Mr. Smith and Dr. Jones met at 10:30 a.m. today,', 'e.g. here.']],
  ['John F. Kennedy, the U.S. president, spoke.', ['John F. Kennedy,', 'the U.S. president,', 'spoke.']],
  ['Wait... then it stopped - really - and so on.', ['Wait...', 'then it stopped', '- really', '- and so on.']],
  ['It was (mostly) fine and "quoted, here" too.', ['It was', '(mostly)', 'fine and', '"quoted,', 'here"', 'too.']],
  ['one—two | three a|b and/or 50/50 odds', ['one—', 'two', '| three a|', 'b and/', 'or 50/50 odds']],
  ['Items:\n- first\n* second\n• third', ['Items:', '- first', '* second', '• third']],
  ['   ', []],
  ['no punctuation at all but long enough', ['no punctuation at all but long enough']],
];

test('cuts at every punctuation mark, never inside numbers, times, URLs, emails or abbreviations', () => {
  for (let round = 0; round < 3; round++) {
    for (const [input, want] of cases) {
      const got = clauses(input);
      assert.deepEqual(got, want, input);
      assert.equal(got.join('').replace(/\s/g, ''), input.replace(/\s/g, ''), input); // nothing lost
    }
  }
});

test('a 5 MB reply splits quickly and keeps every character', () => {
  const big = 'Sure, the numbers are 1,200 and 3.5 at 7:35; see https://x.io/a?b=1. '.repeat(70000);
  const t0 = Date.now();
  const got = clauses(big);
  assert.equal(got.join('').replace(/\s/g, ''), big.replace(/\s/g, ''));
  assert.ok(Date.now() - t0 < 10000, `took ${Date.now() - t0} ms`);
});

test('the page speaks one utterance per piece and resumes the mic only after the last', () => {
  assert.match(html, /const pieces = clauses\(textToSpeak\);/);
  assert.match(html, /utterances\.forEach\(\(u\) => \{ u\.onerror = onerror; synth\.speak\(u\); \}\);/);
  assert.match(html, /const noteEnd = \(\) => \{ if \(synth\.pending\) return;/);
});
