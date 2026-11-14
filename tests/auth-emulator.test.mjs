import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const emulator = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const apiKey = 'fake-api-key';

async function authRequest(method, body) {
  return fetch(`${emulator}/${method}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('Firebase Auth emulator accepts valid email/password registration and login', async () => {
  const email = `auth-emulator-${Date.now()}@example.test`;
  const password = 'Test-Only-Password-123!';

  const signup = await authRequest('accounts:signUp', {
    email,
    password,
    returnSecureToken: true,
  });
  assert.equal(signup.status, 200, 'registration should succeed');
  const created = await signup.json();
  assert.ok(created.localId, 'registration should return a Firebase UID');
  assert.ok(created.idToken, 'registration should return an ID token');

  const login = await authRequest('accounts:signInWithPassword', {
    email,
    password,
    returnSecureToken: true,
  });
  assert.equal(login.status, 200, 'valid credentials should sign in');
  const signedIn = await login.json();
  assert.equal(signedIn.localId, created.localId);
  assert.ok(signedIn.idToken);
});

test('Firebase Auth emulator rejects an incorrect password', async () => {
  const email = `auth-wrong-password-${Date.now()}@example.test`;
  const signup = await authRequest('accounts:signUp', {
    email,
    password: 'Correct-Test-Password-123!',
    returnSecureToken: true,
  });
  assert.equal(signup.status, 200);

  const login = await authRequest('accounts:signInWithPassword', {
    email,
    password: 'Wrong-Test-Password-123!',
    returnSecureToken: true,
  });
  assert.equal(login.status, 400, 'wrong password must not create a session');
  const failure = await login.json();
  assert.match(failure.error?.message || '', /INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD/);
});
