import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { generateKeyPairSync } from 'node:crypto';

process.env.VERCEL = '1';
delete process.env.GEMINI_API_KEY;
delete process.env.CRON_SECRET;
process.env.VITE_FIREBASE_API_KEY = 'ci-test-key';

const nativeFetch = globalThis.fetch.bind(globalThis);
const { isSubscriptionAccessActive } = await import('../src/utils/subscriptionAccess.ts');
const { isSearchBoostActive } = await import('../src/utils/propertyBadges.ts');
const serverModule = await import('../dist/server.cjs');
const app = serverModule.default?.default ?? serverModule.default ?? serverModule.app ?? serverModule;
assert.equal(typeof app, 'function', 'Express app must be exported from the production bundle');
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const base = 'http://127.0.0.1:' + server.address().port;
const endpoints = ['/api/ai/generate-description', '/api/ai/nearby-attractions', '/api/ai/travel-assistant'];

async function post(path, token, body = {}) {
  return nativeFetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
}

test('subscription entitlement hides expired subscriptions and preserves future or unmigrated records', () => {
  assert.equal(isSubscriptionAccessActive({ subscriptionExpiresAt: '2026-11-24T00:00:00.000Z' }, Date.parse('2026-11-25T00:00:00.000Z')), false);
  assert.equal(isSubscriptionAccessActive({ subscriptionExpiresAt: '2026-12-24T00:00:00.000Z' }, Date.parse('2026-11-25T00:00:00.000Z')), true);
  assert.equal(isSubscriptionAccessActive({ subscriptionExpiresAt: '2026-12-24T00:00:00.000Z', subscriptionExpiresAtTimestamp: { toDate: () => new Date('2026-11-24T00:00:00.000Z') } }, Date.parse('2026-11-25T00:00:00.000Z')), false);
  assert.equal(isSubscriptionAccessActive({ subscriptionExpiresAt: '' }, Date.parse('2026-11-25T00:00:00.000Z')), true);
  assert.equal(isSubscriptionAccessActive({ subscriptionStatus: 'expired' }, Date.parse('2026-11-25T00:00:00.000Z')), false);
});

test('expired Search Boosts are excluded from badges and AI ranking', () => {
  assert.equal(isSearchBoostActive({ isFeatured: true, featuredUntil: '2026-11-24T00:00:00.000Z' }), false);
  assert.equal(isSearchBoostActive({ isFeatured: true, featuredUntil: '2026-12-24T00:00:00.000Z' }), true);
  assert.equal(isSearchBoostActive({ isFeatured: false, featuredUntil: '2026-12-24T00:00:00.000Z' }), false);
});

test('subscription expiry maintenance fails closed when CRON_SECRET is not configured', async () => {
  const response = await nativeFetch(base + '/api/cron/expire-subscriptions');
  assert.equal(response.status, 503);
});

test('subscription expiry maintenance rejects missing or invalid bearer authorization', async () => {
  process.env.CRON_SECRET = 'ci-cron-secret';
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  const unauthorized = await nativeFetch(base + '/api/cron/expire-subscriptions');
  assert.equal(unauthorized.status, 401);
  const missingServiceAccount = await nativeFetch(base + '/api/cron/expire-subscriptions', {
    headers: { authorization: 'Bearer ci-cron-secret' },
  });
  assert.equal(missingServiceAccount.status, 503);
  delete process.env.CRON_SECRET;
});

test('subscription cron expires only past-due listings and Search Boosts', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.CRON_SECRET = 'ci-cron-secret';
  process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
    project_id: 'demo-yourthikana',
    client_email: 'ci-service-account@demo-yourthikana.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    token_uri: 'https://oauth2.googleapis.com/token',
  });

  const originalFetch = globalThis.fetch;
  const patches = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'ci-access-token' }), { status: 200 });
    }
    if (url.includes(':runQuery')) {
      const body = JSON.parse(String(init.body || '{}'));
      const field = body.structuredQuery?.where?.fieldFilter?.field?.fieldPath;
      if (field === 'isFeatured') {
        return new Response(JSON.stringify([{
          document: {
            name: 'projects/demo-yourthikana/databases/(default)/documents/properties/expired-boost',
            updateTime: '2026-11-25T00:00:00.000000Z',
            fields: {
              status: { stringValue: 'active' },
              isFeatured: { booleanValue: true },
              featuredUntil: { stringValue: '2026-11-24T00:00:00.000Z' },
            },
          },
        }]), { status: 200 });
      }
      return new Response(JSON.stringify([
        {
          document: {
            name: 'projects/demo-yourthikana/databases/(default)/documents/properties/expired-property',
            updateTime: '2026-11-25T00:00:00.000000Z',
            fields: {
              status: { stringValue: 'active' },
              subscriptionExpiresAtTimestamp: { timestampValue: '2026-11-24T00:00:00.000Z' },
            },
          },
        },
        {
          document: {
            name: 'projects/demo-yourthikana/databases/(default)/documents/properties/future-property',
            updateTime: '2026-11-25T00:00:00.000000Z',
            fields: {
              status: { stringValue: 'active' },
              subscriptionExpiresAtTimestamp: { timestampValue: '2099-12-24T00:00:00.000Z' },
            },
          },
        },
      ]), { status: 200 });
    }
    if (init.method === 'PATCH') {
      patches.push({ url, body: JSON.parse(String(init.body || '{}')) });
      return new Response(JSON.stringify({ name: url }), { status: 200 });
    }
    throw new Error('Unexpected upstream request: ' + url);
  };

  try {
    const response = await nativeFetch(base + '/api/cron/expire-subscriptions', {
      headers: { authorization: 'Bearer ci-cron-secret' },
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.expired, 1);
    assert.equal(payload.searchBoostsExpired, 1);
    assert.equal(patches.length, 2);
    assert.equal(patches.some(item => item.body.fields?.status?.stringValue === 'hidden_expired'), true);
    assert.equal(patches.some(item => item.body.fields?.isFeatured?.booleanValue === false), true);
    assert.equal(patches.some(item => item.url.includes('/future-property')), false);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.CRON_SECRET;
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
  }
});

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
  for (let index = 0; index < 20; index += 1) assert.equal((await post('/api/ai/generate-description', 'valid-test-token', { propertyName: 'CI test property' })).status, 500);
  const limited = await post('/api/ai/generate-description', 'valid-test-token');
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get('retry-after'));
});

after(async () => { globalThis.fetch = nativeFetch; await new Promise(resolve => server.close(resolve)); });