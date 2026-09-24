// The daemon holds one pending request at a time and frees it when the client
// closes the connection (stts-daemon.ts, `req.on('close')`). So a client that
// waits for an answer nobody will give is a client that wedges every later tool
// call until the daemon is restarted. These check the real postRequest against a
// server that accepts and never answers, which is the shape of a `listen` that
// is heard by nobody.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { postRequest } from '../src/daemon-client.ts';

function silentServer() {
  const server = http.createServer(() => {});
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

test('a request that gets no answer is dropped, not waited on forever', async () => {
  const { server, port } = await silentServer();
  try {
    const started = Date.now();
    await assert.rejects(
      () => postRequest({ mode: 'stt' }, port, 400),
      /no answer from the voice window/
    );
    const took = Date.now() - started;
    assert.ok(took >= 350 && took < 5000, `dropped after ${took}ms, expected about 400ms`);
  } finally {
    server.close();
  }
});

test('the connection really closes, which is what frees the daemon', async () => {
  let closed = false;
  const server = http.createServer((req) => {
    req.on('close', () => { closed = true; });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(() => postRequest({ mode: 'stt' }, server.address().port, 400));
    // The daemon frees its pending request on this event, so a client timeout
    // that did not close the socket would fix nothing.
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(closed, true, 'client must close the socket, or the daemon stays busy');
  } finally {
    server.close();
  }
});
