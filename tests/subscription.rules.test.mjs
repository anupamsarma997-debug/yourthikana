import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

let env;
const projectId = 'demo-yourthikana';
const screenshot = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

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
  });
});

after(async () => {
  await env?.cleanup();
});

function applicationData(overrides = {}) {
  return {
    ownerUid: 'owner-1',
    propertyId: 'active-property',
    propertyTitle: 'Test property',
    amount: 1000,
    status: 'awaiting_payment',
    paymentStatus: 'pending',
    paymentUtr: '',
    proofSubmissionMethod: 'whatsapp',
    proofStatus: 'awaiting_payment',
    submittedAt: Timestamp.now(),
    ...overrides,
  };
}

test('only the property owner can create a ₹1,000 monthly subscription application', async () => {
  const ownerDb = env.authenticatedContext('owner-1').firestore();
  const otherDb = env.authenticatedContext('owner-2').firestore();
  await assertSucceeds(setDoc(doc(ownerDb, 'subscriptionApplications', 'sub-1'), applicationData()));
  await assertFails(setDoc(doc(otherDb, 'subscriptionApplications', 'sub-2'), applicationData({ ownerUid: 'owner-2' })));
});

test('monthly subscription application rejects any amount other than ₹1,000', async () => {
  const ownerDb = env.authenticatedContext('owner-1').firestore();
  await assertFails(setDoc(doc(ownerDb, 'subscriptionApplications', 'sub-bad'), applicationData({ amount: 1500 })));
});

test('owner can submit a valid UTR after creating a monthly subscription request', async () => {
  const ownerDb = env.authenticatedContext('owner-1').firestore();
  const applicationRef = doc(ownerDb, 'subscriptionApplications', 'sub-1');
  await setDoc(applicationRef, applicationData());
  await assertSucceeds(updateDoc(applicationRef, {
    status: 'pending',
    paymentStatus: 'pending',
    paymentUtr: 'SUB12345678',
    paymentSubmittedAt: Timestamp.now(),
    proofSubmissionMethod: 'whatsapp',
    proofStatus: 'share_sheet_opened',
  }));
});

test('owner can upload private subscription payment evidence only for their application', async () => {
  const ownerDb = env.authenticatedContext('owner-1').firestore();
  await setDoc(doc(ownerDb, 'subscriptionApplications', 'sub-1'), applicationData());
  const ownerStorage = env.authenticatedContext('owner-1').storage('gs://demo-yourthikana.appspot.com');
  const otherStorage = env.authenticatedContext('owner-2').storage('gs://demo-yourthikana.appspot.com');
  await assertSucceeds(uploadBytes(ref(ownerStorage, 'subscription-documents/owner-1/sub-1/payment.png'), screenshot, { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(otherStorage, 'subscription-documents/owner-1/sub-1/other.png'), screenshot, { contentType: 'image/png' }));
});

test('only the verified platform admin can read monthly subscription evidence', async () => {
  const ownerDb = env.authenticatedContext('owner-1').firestore();
  await setDoc(doc(ownerDb, 'subscriptionApplications', 'sub-1'), applicationData());
  const ownerStorage = env.authenticatedContext('owner-1').storage('gs://demo-yourthikana.appspot.com');
  const path = 'subscription-documents/owner-1/sub-1/payment.png';
  await uploadBytes(ref(ownerStorage, path), screenshot, { contentType: 'image/png' });
  const adminStorage = env.authenticatedContext('admin-1', {
    email: 'anupamsarma997@gmail.com',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  }).storage('gs://demo-yourthikana.appspot.com');
  await assertFails(getBytes(ref(ownerStorage, path)));
  await assertSucceeds(getBytes(ref(adminStorage, path)));
});


test('owner cannot self-activate or extend subscription and badge expiry', async () => {
  const ownerDb = env.authenticatedContext('owner-1').firestore();
  const propertyRef = doc(ownerDb, 'properties', 'active-property');
  await assertFails(updateDoc(propertyRef, { subscriptionStatus: 'active' }));
  await assertFails(updateDoc(propertyRef, { subscriptionExpiresAt: '2099-01-01T00:00:00.000Z' }));
  await assertFails(updateDoc(propertyRef, { verifiedUntil: '2099-01-01T00:00:00.000Z' }));
  await assertFails(updateDoc(propertyRef, { featuredUntil: '2099-01-01T00:00:00.000Z' }));
});
