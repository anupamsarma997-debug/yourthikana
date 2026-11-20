import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { ref, uploadBytes, deleteObject } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-thikana',
    storage: { rules: readFileSync('storage.rules', 'utf8') },
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('private verification proofs require an existing pending application and are admin-readable only', async () => {
  const ownerStorage = testEnv.authenticatedContext('proof-owner').storage();
  const strangerStorage = testEnv.authenticatedContext('proof-stranger').storage();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'verificationApplications', 'proof-app'), {
      ownerUid: 'proof-owner',
      status: 'pending',
    });
  });
  const proof = ref(ownerStorage, 'verification-documents/proof-owner/proof-app/proof.pdf');
  await assertSucceeds(uploadBytes(proof, new Uint8Array([1, 2, 3]), { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(
    ref(strangerStorage, 'verification-documents/proof-owner/proof-app/attack.pdf'),
    new Uint8Array([1, 2, 3]),
    { contentType: 'application/pdf' }
  ));
  await assertFails(uploadBytes(
    ref(ownerStorage, 'verification-documents/proof-owner/missing-app/proof.pdf'),
    new Uint8Array([1, 2, 3]),
    { contentType: 'application/pdf' }
  ));
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
