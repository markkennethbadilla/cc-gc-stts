// Spec 038. A picked voice that is not installed is never silently swapped or saved over:
// the window says so, rechecks the list, and the picker keeps showing the pick.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

for (const f of ['src/stts_ui.html', 'dist/stts_ui.html']) {
  const html = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const src = html.slice(html.indexOf('function piperVoiceFor()'), html.indexOf('const ttsLog ='));

  function run(saved, installed) {
    const ls = new Map(saved ? [['__stts__voice', saved]] : []);
    const el = { hidden: true, textContent: '' };
    let reloads = 0;
    const ctx = {
      LS_VOICE: '__stts__voice', PIPER_DEFAULT: 'en_GB-jenny_dioco-medium',
      piperVoices: installed.map((name) => ({ name })),
      localStorage: { getItem: (k) => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, v) },
      speechSynthesis: { getVoices: () => [] },
      document: { getElementById: () => el },
      ttsLog: () => { }, loadPiperVoices: () => { reloads++; },
    };
    vm.runInNewContext(src + '; result = piperVoiceFor();', ctx);
    return { voice: ctx.result, el, reloads, saved: ls.get('__stts__voice') };
  }

  test(`${f}: missing default voice is announced, not saved, and rechecked`, () => {
    const r = run(null, ['en_US-lessac-medium']);
    assert.equal(r.voice, 'en_US-lessac-medium');
    assert.equal(r.el.hidden, false);
    assert.match(r.el.textContent, /jenny_dioco-medium is not installed; speaking en_US-lessac-medium/);
    assert.equal(r.reloads, 1);
    assert.equal(r.saved, undefined);
  });

  test(`${f}: missing picked voice keeps the pick saved`, () => {
    const r = run('en_GB-jenny_dioco-medium', ['en_US-lessac-medium']);
    assert.equal(r.saved, 'en_GB-jenny_dioco-medium');
    assert.equal(r.el.hidden, false);
  });

  test(`${f}: installed pick speaks it and clears the notice`, () => {
    const r = run(null, ['en_GB-jenny_dioco-medium', 'en_US-lessac-medium']);
    assert.equal(r.voice, 'en_GB-jenny_dioco-medium');
    assert.equal(r.el.hidden, true);
    assert.equal(r.reloads, 0);
  });

  test(`${f}: settings use the native popover, rows shown at any width`, () => {
    assert.ok(html.includes("settingsPop.popover = 'auto'"));
    assert.ok(html.includes('#settings-pop .history-bar { display: flex;'));
    assert.ok(html.includes('(not installed)</option>'));
  });
}
