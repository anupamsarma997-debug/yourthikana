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


test('only the active property owner can create a monthly subscription request', async () => {
  const ownerDb = env.authenticatedContext('owner-1').firestore();
  const otherDb = env.authenticatedContext('owner-2').firestore();
  const application = {
    ownerUid: 'owner-1',
    propertyId: 'active-property',
    propertyTitle: 'Original listing',
    amount: 1000,
    status: 'awaiting_payment',
    paymentStatus: 'pending',
    paymentUtr: '',
    proofSubmissionMethod: 'app_upload',
    proofStatus: 'awaiting_payment',
    submittedAt: Timestamp.now(),
  };

  await assertSucceeds(setDoc(doc(ownerDb, 'subscriptionApplications', 'monthly-1'), application));
  await assertFails(setDoc(doc(otherDb, 'subscriptionApplications', 'monthly-2'), {
    ...application,
    ownerUid: 'owner-2',
  }));
  await assertFails(setDoc(doc(ownerDb, 'subscriptionApplications', 'monthly-wrong-amount'), {
    ...application,
    amount: 500,
  }));
  await assertFails(setDoc(doc(ownerDb, 'subscriptionApplications', 'monthly-private-property'), {
    ...application,
    propertyId: 'private-property',
  }));
});

test('monthly subscription owner can submit a UTR but cannot approve payment', async () => {
  const db = env.authenticatedContext('owner-1').firestore();
  const applicationRef = doc(db, 'subscriptionApplications', 'monthly-utr-1');
  await setDoc(applicationRef, {
    ownerUid: 'owner-1',
    propertyId: 'active-property',
    propertyTitle: 'Original listing',
    amount: 1000,
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
    paymentUtr: 'UTR123456789',
    paymentSubmittedAt: Timestamp.now(),
    proofSubmissionMethod: 'app_upload',
    proofStatus: 'uploaded',
  }));
  await assertFails(updateDoc(applicationRef, {
    status: 'approved',
    paymentStatus: 'verified',
  }));
});

test('an owner can atomically create a pending property and its duplicate fingerprint', async () => {
  const db = env.authenticatedContext('owner-1').firestore();
  const propertyId = 'prop-atomic-test';
  const duplicateKey = 'fingerprint-atomic-test';
  const property = {
    id: propertyId,
    title: 'Test homestay',
    city: 'Guwahati',
    ownerUid: 'owner-1',
    ownerId: 'owner-1',
    ownerName: 'Test Host',
    ownerPhone: '',
    ownerWhatsApp: '',
    description: '',
    propertyType: 'Homestay',
    address: 'Test address',
    state: 'Assam',
    latitude: null,
    longitude: null,
    checkInTime: '',
    checkOutTime: '',
    photos: [],
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

  await assertSucceeds(runTransaction(db, async (transaction) => {
    const duplicateRef = doc(db, 'property_duplicate_keys', duplicateKey);
    const existing = await transaction.get(duplicateRef);
    assert.equal(existing.exists(), false);
    transaction.set(duplicateRef, {
      ownerUid: 'owner-1',
      propertyId,
      createdAt: new Date().toISOString(),
    });
    transaction.set(doc(db, 'properties', propertyId), property);
  }));

  await assertSucceeds(getDoc(doc(db, 'properties', propertyId)));
});

test('another account cannot claim a duplicate fingerprint for its own property', async () => {
  const ownerDb = env.authenticatedContext('owner-1').firestore();
  const otherDb = env.authenticatedContext('owner-2').firestore();
  const propertyId = 'prop-owner-1';
  const duplicateKey = 'fingerprint-owned-by-1';
  const property = {
    id: propertyId, title: 'Owned listing', city: 'Guwahati',
    ownerUid: 'owner-1', ownerId: 'owner-1', ownerName: 'Owner',
    ownerPhone: '', ownerWhatsApp: '', description: '', propertyType: 'Hotel',
    address: 'Address', state: 'Assam', latitude: null, longitude: null,
    checkInTime: '', checkOutTime: '', photos: [], rating: 0, reviewsCount: 0,
    isVerified: false, isFeatured: false, status: 'pending',
    subscriptionPlan: 'none', subscriptionPrice: 0,
    subscriptionExpiresAt: '', createdAt: new Date().toISOString(),
    duplicateKeys: [duplicateKey],
  };
  await assertSucceeds(runTransaction(ownerDb, async (transaction) => {
    transaction.set(doc(ownerDb, 'property_duplicate_keys', duplicateKey), {
      ownerUid: 'owner-1', propertyId, createdAt: new Date().toISOString(),
    });
    transaction.set(doc(ownerDb, 'properties', propertyId), property);
  }));

  const otherProperty = { ...property, id: 'prop-owner-2', ownerUid: 'owner-2', ownerId: 'owner-2' };
  await assertFails(runTransaction(otherDb, async (transaction) => {
    transaction.set(doc(otherDb, 'property_duplicate_keys', duplicateKey), {
      ownerUid: 'owner-2', propertyId: 'prop-owner-2', createdAt: new Date().toISOString(),
    });
    transaction.set(doc(otherDb, 'properties', 'prop-owner-2'), otherProperty);
  }));
});
