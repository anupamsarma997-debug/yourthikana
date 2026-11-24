import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, Timestamp, runTransaction } from 'firebase/firestore';

let env;
const projectId = 'demo-yourthikana';

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'properties', 'active-property'), {
      id: 'active-property',
      ownerUid: 'owner-1',
      ownerId: 'owner-1',
      title: 'Original listing',
      city: 'Guwahati',
      status: 'active',
      isVerified: false,
      isFeatured: false,
      rating: 0,
      reviewsCount: 0,
    });
    await setDoc(doc(context.firestore(), 'properties', 'private-property'), {
      id: 'private-property',
      ownerUid: 'owner-1',
      ownerId: 'owner-1',
      title: 'Pending listing',
      city: 'Guwahati',
      status: 'pending',
      isVerified: false,
      isFeatured: false,
      rating: 0,
      reviewsCount: 0,
    });
  });
});

after(async () => {
  await env?.cleanup();
});

test('active listings are publicly readable', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, 'properties', 'active-property')));
});

test('a pending listing is private to its owner', async () => {
  const ownerDb = env.authenticatedContext('owner-1').firestore();
  const otherDb = env.authenticatedContext('owner-2').firestore();
  await assertSucceeds(getDoc(doc(ownerDb, 'properties', 'private-property')));
  await assertFails(getDoc(doc(otherDb, 'properties', 'private-property')));
});

test('an owner can edit their listing title', async () => {
  const db = env.authenticatedContext('owner-1').firestore();
  await assertSucceeds(updateDoc(doc(db, 'properties', 'active-property'), { title: 'Updated title' }));
});

test('an owner cannot self-approve or feature their listing', async () => {
  const db = env.authenticatedContext('owner-1').firestore();
  await assertFails(updateDoc(doc(db, 'properties', 'active-property'), { isVerified: true }));
  await assertFails(updateDoc(doc(db, 'properties', 'active-property'), { status: 'active', isFeatured: true }));
});

test('another owner cannot edit the listing', async () => {
  const db = env.authenticatedContext('owner-2').firestore();
  await assertFails(updateDoc(doc(db, 'properties', 'active-property'), { title: 'Hijacked' }));
});

test('only the listing owner can create a Search Boost application', async () => {
  const ownerDb = env.authenticatedContext('owner-1').firestore();
  const otherDb = env.authenticatedContext('owner-2').firestore();
  const application = {
    ownerUid: 'owner-1',
    propertyId: 'active-property',
    propertyTitle: 'Original listing',
    status: 'awaiting_payment',
    paymentStatus: 'pending',
    paymentUtr: '',
    proofSubmissionMethod: 'app_upload',
    proofStatus: 'awaiting_payment',
    submittedAt: Timestamp.now(),
  };
  await assertSucceeds(setDoc(doc(ownerDb, 'searchBoostApplications', 'boost-1'), application));
  await assertFails(setDoc(doc(otherDb, 'searchBoostApplications', 'boost-2'), {
    ...application,
    ownerUid: 'owner-2',
  }));
});

test('an owner can submit a valid Search Boost UTR for review', async () => {
  const db = env.authenticatedContext('owner-1').firestore();
  const applicationRef = doc(db, 'searchBoostApplications', 'boost-1');
  await setDoc(applicationRef, {
    ownerUid: 'owner-1',
    propertyId: 'active-property',
    propertyTitle: 'Original listing',
    status: 'awaiting_payment',
    paymentStatus: 'pending',
    paymentUtr: '',
    proofSubmissionMethod: 'app_upload',
    proofStatus: 'awaiting_payment',
    submittedAt: Timestamp.now(),
  });
  await assertSucceeds(updateDoc(applicationRef, {
    status: 'pending',
    paymentStatus: 'pending',
    paymentUtr: 'TXN12345678',
    paymentSubmittedAt: Timestamp.now(),
    proofSubmissionMethod: 'app_upload',
    proofStatus: 'uploaded',
  }));
});

test('an invalid Search Boost UTR is rejected', async () => {
  const db = env.authenticatedContext('owner-1').firestore();
  const applicationRef = doc(db, 'searchBoostApplications', 'boost-1');
  await setDoc(applicationRef, {
    ownerUid: 'owner-1',
    propertyId: 'active-property',
    propertyTitle: 'Original listing',
    status: 'awaiting_payment',
    paymentStatus: 'pending',
    paymentUtr: '',
    proofSubmissionMethod: 'app_upload',
    proofStatus: 'awaiting_payment',
    submittedAt: Timestamp.now(),
  });
  await assertFails(updateDoc(applicationRef, {
    status: 'pending',
    paymentStatus: 'pending',
    paymentUtr: '123',
    paymentSubmittedAt: Timestamp.now(),
    proofSubmissionMethod: 'app_upload',
    proofStatus: 'uploaded',
  }));
});


test('an owner cannot extend subscription or paid badge validity', async () => {
  const db = env.authenticatedContext('owner-1').firestore();
  const propertyRef = doc(db, 'properties', 'active-property');
  await assertFails(updateDoc(propertyRef, { subscriptionStatus: 'active' }));
  await assertFails(updateDoc(propertyRef, { subscriptionExpiresAt: '2099-01-01T00:00:00.000Z' }));
  await assertFails(updateDoc(propertyRef, { subscriptionTrialEndsAt: '2099-01-01T00:00:00.000Z' }));
  await assertFails(updateDoc(propertyRef, { verifiedUntil: '2099-01-01T00:00:00.000Z' }));
  await assertFails(updateDoc(propertyRef, { featuredUntil: '2099-01-01T00:00:00.000Z' }));
});


test('an authenticated owner can atomically create a pending property and its duplicate-key lock', async () => {
  const db = env.authenticatedContext('owner-create-1').firestore();
  const propertyId = 'prop_owner_create_1';
  const duplicateKey = 'a'.repeat(64);
  const property = {
    id: propertyId,
    title: 'Hotel Parvati',
    description: 'Hotel located in Guwahati, Assam. Kamakhya.',
    propertyType: 'Hotel',
    address: 'Kamakhya',
    city: 'Guwahati',
    state: 'Assam',
    latitude: null,
    longitude: null,
    checkInTime: '',
    checkOutTime: '',
    photos: [],
    ownerUid: 'owner-create-1',
    ownerId: 'owner-create-1',
    ownerName: 'Host',
    ownerPhone: '',
    ownerWhatsApp: '',
    ownerEmail: '',
    rating: 0,
    reviewsCount: 0,
    isVerified: false,
    isFeatured: false,
    status: 'pending',
    subscriptionPlan: 'none',
    subscriptionPrice: 0,
    subscriptionExpiresAt: '',
    subscriptionExpiryDate: '',
    createdAt: new Date().toISOString(),
    duplicateKeys: [duplicateKey],
  };

  await assertSucceeds(runTransaction(db, async transaction => {
    transaction.set(doc(db, 'property_duplicate_keys', duplicateKey), {
      ownerUid: 'owner-create-1',
      propertyId,
      createdAt: new Date().toISOString(),
    });
    transaction.set(doc(db, 'properties', propertyId), property);
  }));
});

test('an owner cannot create a property for a different Firebase UID', async () => {
  const db = env.authenticatedContext('owner-create-1').firestore();
  const propertyId = 'prop_forged_owner';
  const duplicateKey = 'b'.repeat(64);
  const property = {
    id: propertyId,
    title: 'Forged listing',
    description: 'Test',
    propertyType: 'Hotel',
    address: 'Kamakhya',
    city: 'Guwahati',
    state: 'Assam',
    latitude: null,
    longitude: null,
    checkInTime: '',
    checkOutTime: '',
    photos: [],
    ownerUid: 'owner-create-2',
    ownerId: 'owner-create-2',
    ownerName: 'Other host',
    ownerPhone: '',
    ownerWhatsApp: '',
    rating: 0,
    reviewsCount: 0,
    isVerified: false,
    isFeatured: false,
    status: 'pending',
    subscriptionPlan: 'none',
    subscriptionPrice: 0,
    subscriptionExpiresAt: '',
    createdAt: new Date().toISOString(),
    duplicateKeys: [duplicateKey],
  };

  await assertFails(runTransaction(db, async transaction => {
    transaction.set(doc(db, 'property_duplicate_keys', duplicateKey), {
      ownerUid: 'owner-create-2',
      propertyId,
      createdAt: new Date().toISOString(),
    });
    transaction.set(doc(db, 'properties', propertyId), property);
  }));
});
