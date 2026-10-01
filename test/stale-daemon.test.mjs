// Spec 041: a daemon from another plugin directory is shut down; a live window keeps it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
process.env.STTS_PORT = '15991';
const { stopStaleDaemon } = await import('../src/daemon-client.ts');

function fake(open) {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    if (req.url === '/api/ping') return res.end('ok'); // no X-Stts-Dir: an old daemon
    if (req.url === '/barge') return res.end(JSON.stringify({ text: '', open }));
    res.end('ok');
    server.close();
    server.closeAllConnections();
  });
  return new Promise((r) => server.listen(15991, '127.0.0.1', () => r({ server, hits })));
}

test('stale daemon with no live window is shut down', async () => {
  const { server, hits } = await fake(false);
  assert.equal(await stopStaleDaemon(), true);
  assert.ok(hits.includes('/api/shutdown'));
  server.close();
});

test('stale daemon with a live window is left alone', async () => {
  const { server, hits } = await fake(true);
  assert.equal(await stopStaleDaemon(), false);
  assert.ok(!hits.includes('/api/shutdown'));
  server.close();
  server.closeAllConnections();
});
