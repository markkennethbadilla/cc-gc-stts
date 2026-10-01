// Spec 038. Clips are trimmed to speech, so the page adds the pause between sentences.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

for (const f of ['src/stts_ui.html', 'dist/stts_ui.html']) {
  test(`${f}: sentence ends pause 350 ms, other cuts 150 ms, gap only between clips`, () => {
    const html = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    const m = html.match(/function gapAfter\(text\) \{[^\n]*\}/);
    assert.ok(m, 'gapAfter missing');
    const gapAfter = vm.runInNewContext(`(${m[0]})`);
    for (const t of ["it's not worth it.", 'Sound good?', 'Wow!', 'He said "go."', 'done.) ']) assert.equal(gapAfter(t), 350, t);
    for (const t of ['a long run, cut here', 'no punctuation']) assert.equal(gapAfter(t), 150, t);
    assert.ok(html.includes('if (!c.last || clips.length || splits) await new Promise(r => setTimeout(r, gapAfter(c.text)));'));
  });
}
