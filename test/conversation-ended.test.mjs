// End conversation has to be tellable apart from every other way a turn ends.
// It used to send the normal tts `close` or the stt `cancel`, so an agent saw an
// empty reply and could not know whether he had ended the conversation, said
// nothing, or the turn had simply finished. These check the two ends that carry
// the indicator, against the real sources.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONVERSATION_ENDED } from '../src/protocol.ts';

const html = readFileSync(new URL('../src/stts_ui.html', import.meta.url), 'utf8');
const daemon = readFileSync(new URL('../src/stts-daemon.ts', import.meta.url), 'utf8');

const handler = (() => {
  const start = html.indexOf("document.getElementById('end-btn').onclick");
  assert.ok(start > -1, "the End conversation button's handler was not found");
  const end = html.indexOf("document.title = 'Conversation ended'", start);
  assert.ok(end > start, 'the handler did not reach its end');
  return html.slice(start, end);
})();

test('the End conversation button says so in its own message', () => {
  assert.match(handler, /sendSocket\(\{ type: 'ended' \}\)/);
});

test('it no longer borrows the normal close or cancel', () => {
  assert.doesNotMatch(handler, /type: 'close'/, 'close means the turn finished');
  assert.doesNotMatch(handler, /type: 'cancel'/, 'cancel means the turn was abandoned');
});

test('the daemon answers that message with the marker, not with silence', () => {
  const at = daemon.indexOf("case 'ended':");
  assert.ok(at > -1, "the daemon does not handle 'ended'");
  const branch = daemon.slice(at, daemon.indexOf('return;', at));
  assert.match(branch, /resolvePending\(CONVERSATION_ENDED\)/);
  assert.doesNotMatch(branch, /resolvePending\(''\)/, 'an empty reply is the thing it replaces');
});

test('the marker is one definition, shared by both ends', () => {
  assert.equal(typeof CONVERSATION_ENDED, 'string');
  assert.ok(CONVERSATION_ENDED.length > 8, 'a marker has to be unmistakable');
  assert.ok(
    /^[\x20-\x7e]+$/.test(CONVERSATION_ENDED),
    'ASCII only, the house terminal rule'
  );
  // No speech transcript looks like this: no letters-only word, wrapped in
  // underscores so it cannot be a misheard word either.
  assert.match(CONVERSATION_ENDED, /^__[A-Z_]+__$/);
});
