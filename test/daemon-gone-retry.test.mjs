// Spec 009. A daemon that dies mid-request resets the socket. The client starts
// a fresh daemon and sends once more; any other failure is not retried.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { postRequest, sendWithRetry } from '../src/daemon-client.ts';

// Accepts the request, then kills the socket: what a dying daemon looks like.
function resettingServer() {
  const server = http.createServer((req) => req.socket.destroy());
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

test('a real reset from the daemon is retried once and the second answer returned', async () => {
  const { server, port } = await resettingServer();
  try {
    let sends = 0;
    let ensures = 0;
    const send = async (body) => {
      sends++;
      if (sends === 1) return postRequest(body, port, 2000);
      return 'heard';
    };
    const text = await sendWithRetry({ mode: 'stt' }, send, async () => { ensures++; });
    assert.equal(text, 'heard');
    assert.equal(sends, 2);
    assert.equal(ensures, 2);
  } finally {
    server.close();
  }
});

test('a second reset is reported, not looped on', async () => {
  const { server, port } = await resettingServer();
  try {
    let sends = 0;
    const send = (body) => { sends++; return postRequest(body, port, 2000); };
    await assert.rejects(() => sendWithRetry({ mode: 'tts' }, send, async () => {}), { code: 'ECONNRESET' });
    assert.equal(sends, 2);
  } finally {
    server.close();
  }
});

test('busy and timeouts are not retried', async () => {
  for (const err of [new Error('stts daemon is busy with another request'), new Error('no answer from the voice window within 240s')]) {
    let sends = 0;
    const send = async () => { sends++; throw err; };
    await assert.rejects(() => sendWithRetry({}, send, async () => {}), err);
    assert.equal(sends, 1);
  }
});
