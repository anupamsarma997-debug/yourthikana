import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { ref, uploadBytes, deleteObject } from 'firebase/storage';

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-thikana',
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('only the matching authenticated owner can upload allowed images', async () => {
  const ownerStorage = testEnv.authenticatedContext('owner-1').storage();
  const otherStorage = testEnv.authenticatedContext('owner-2').storage();
  const file = new Uint8Array([1, 2, 3, 4]);

  const ownRef = ref(ownerStorage, 'properties/owner-1/property-1/photo.jpg');
  await assertSucceeds(uploadBytes(ownRef, file, { contentType: 'image/jpeg' }));

  await assertFails(uploadBytes(
    ref(otherStorage, 'properties/owner-1/property-1/attacker.jpg'),
    file,
    { contentType: 'image/jpeg' }
  ));

  await assertFails(uploadBytes(
    ref(ownerStorage, 'properties/owner-1/property-1/not-an-image.txt'),
    file,
    { contentType: 'text/plain' }
  ));
});

test('uploads larger than 5 MB are rejected', async () => {
  const ownerStorage = testEnv.authenticatedContext('owner-1').storage();
  const oversized = new Uint8Array(5 * 1024 * 1024 + 1);
  await assertFails(uploadBytes(
    ref(ownerStorage, 'properties/owner-1/property-1/too-large.jpg'),
    oversized,
    { contentType: 'image/jpeg' }
  ));
});

test('unauthenticated users cannot upload and only the owner can delete', async () => {
  const ownerStorage = testEnv.authenticatedContext('owner-1').storage();
  const otherStorage = testEnv.authenticatedContext('owner-2').storage();
  const publicStorage = testEnv.unauthenticatedContext().storage();
  const fileRef = ref(ownerStorage, 'properties/owner-1/property-1/delete-me.jpg');

  await assertSucceeds(uploadBytes(fileRef, new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(
    ref(publicStorage, 'properties/owner-1/property-1/public-upload.jpg'),
    new Uint8Array([1, 2, 3]),
    { contentType: 'image/jpeg' }
  ));
  await assertFails(deleteObject(ref(otherStorage, 'properties/owner-1/property-1/delete-me.jpg')));
  await assertSucceeds(deleteObject(fileRef));
});
