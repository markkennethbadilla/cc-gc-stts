import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
test('typed message keeps the voice loop (spec 026)', () => {
  for (const f of ['src/stts-mcp-server.ts', 'dist/stts-mcp-server.mjs', 'skills/stts/SKILL.md', 'commands/stts.md', 'commands/stts.toml'])
    assert.match(readFileSync(new URL('../' + f, import.meta.url), 'utf8'), /Typing never ends the conversation/, f);
});
