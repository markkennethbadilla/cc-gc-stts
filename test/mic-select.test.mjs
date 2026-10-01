// Spec 039: the mic picker defaults to System default and feeds deviceId into the mic request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../src/stts_ui.html', import.meta.url), 'utf8');
test('picker has System default, enumerates, persists, applies', () => {
  assert.match(html, /<option value="">System default<\/option>/);
  assert.match(html, /enumerateDevices\(\)/);
  assert.match(html, /localStorage\.setItem\(LS_MIC, micSelect\.value\); freshTrack\(\)/);
  assert.match(html, /deviceId: \{ ideal: id \}/);
});
