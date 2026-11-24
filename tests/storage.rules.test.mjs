import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

let env;
const projectId = 'demo-yourthikana';
const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'properties', 'active-property'), {
      id: 'active-property',
      ownerUid: 'owner-1',
      ownerId: 'owner-1',
      title: 'Test property',
      status: 'active',
    });
    await setDoc(doc(context.firestore(), 'searchBoostApplications', 'boost-1'), {
      ownerUid: 'owner-1',
      propertyId: 'active-property',
      status: 'awaiting_payment',
    });
    await setDoc(doc(context.firestore(), 'verificationApplications', 'verify-1'), {
      ownerUid: 'owner-1',
      propertyId: 'active-property',
      status: 'awaiting_payment',
    });
  });
});

after(async () => {
  await env?.cleanup();
});

test('property owner can upload a property photo to their own path', async () => {
  const storage = env.authenticatedContext('owner-1').storage();
  await assertSucceeds(uploadBytes(ref(storage, 'properties/owner-1/active-property/room.png'), image, { contentType: 'image/png' }));
});

test('another account cannot upload a property photo into the owner path', async () => {
  const storage = env.authenticatedContext('owner-2').storage();
  await assertFails(uploadBytes(ref(storage, 'properties/owner-1/active-property/room.png'), image, { contentType: 'image/png' }));
});

test('owner can upload Blue Tick property documents while payment is awaiting', async () => {
  const storage = env.authenticatedContext('owner-1').storage();
  await assertSucceeds(uploadBytes(ref(storage, 'verification-documents/owner-1/verify-1/licence.png'), image, { contentType: 'image/png' }));
});

test('another account cannot upload Blue Tick evidence', async () => {
  const storage = env.authenticatedContext('owner-2').storage();
  await assertFails(uploadBytes(ref(storage, 'verification-documents/owner-1/verify-1/licence.png'), image, { contentType: 'image/png' }));
});

test('private evidence is readable by verified platform admin but not by owner', async () => {
  const ownerStorage = env.authenticatedContext('owner-1').storage();
  await uploadBytes(ref(ownerStorage, 'verification-documents/owner-1/verify-1/licence.png'), image, { contentType: 'image/png' });

  const adminStorage = env.authenticatedContext('admin-1', {
    email: 'anupamsarma997@gmail.com',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  }).storage();
  await assertFails(getBytes(ref(ownerStorage, 'verification-documents/owner-1/verify-1/licence.png')));
  await assertSucceeds(getBytes(ref(adminStorage, 'verification-documents/owner-1/verify-1/licence.png')));
});

test('unsupported file content types are rejected for private evidence', async () => {
  const storage = env.authenticatedContext('owner-1').storage();
  await assertFails(uploadBytes(ref(storage, 'verification-documents/owner-1/verify-1/script.txt'), image, { contentType: 'text/plain' }));
});
