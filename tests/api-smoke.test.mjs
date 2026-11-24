import assert from 'node:assert/strict';
import { after, test } from 'node:test';

process.env.VERCEL = '1';
delete process.env.GEMINI_API_KEY;
process.env.VITE_FIREBASE_API_KEY = 'ci-test-key';

const nativeFetch = globalThis.fetch.bind(globalThis);
const serverModule = await import('../dist/server.cjs');
const app = serverModule.default?.default ?? serverModule.default ?? serverModule.app ?? serverModule;
assert.equal(typeof app, 'function', 'Express app must be exported from the production bundle');
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const base = 'http://127.0.0.1:' + server.address().port;
const endpoints = ['/api/ai/generate-description', '/api/ai/nearby-attractions', '/api/ai/travel-assistant'];

async function post(path, token) {
  return nativeFetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({}),
  });
}

test('health endpoint returns HTTP 200 without an authenticated session', async () => {
  const response = await nativeFetch(base + '/api/health');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ok');
});

test('all AI endpoints reject requests without a Firebase ID token', async () => {
  for (const endpoint of endpoints) assert.equal((await post(endpoint)).status, 401, endpoint);
});

test('all AI endpoints reject invalid Firebase ID tokens', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'INVALID_ID_TOKEN' } }), { status: 400, headers: { 'content-type': 'application/json' } });
  for (const endpoint of endpoints) assert.equal((await post(endpoint, 'invalid-token')).status, 401, endpoint);
});

test('AI endpoints apply a 20-request per-minute per-user limit', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ users: [{ localId: 'ci-user-1' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  for (let index = 0; index < 20; index += 1) assert.equal((await post('/api/ai/generate-description', 'valid-test-token')).status, 500);
  const limited = await post('/api/ai/generate-description', 'valid-test-token');
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get('retry-after'));
});

after(async () => {
  globalThis.fetch = nativeFetch;
  await new Promise(resolve => server.close(resolve));
});