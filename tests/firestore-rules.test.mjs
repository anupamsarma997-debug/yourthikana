import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-thikana',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

async function createOwnedProperty(uid = 'owner-1', propertyId = 'property-1') {
  const ownerDb = testEnv.authenticatedContext(uid).firestore();
  await assertSucceeds(setDoc(doc(ownerDb, 'properties', propertyId), {
    title: 'Test Homestay',
    city: 'Guwahati',
    ownerUid: uid,
    ownerId: uid,
  }));
  return ownerDb;
}

test('public visitors can read published property listings', async () => {
  const ownerDb = await createOwnedProperty();
  const publicDb = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(getDocs(collection(publicDb, 'properties')));
});

test('a signed-in user cannot create a property for another owner', async () => {
  const attackerDb = testEnv.authenticatedContext('attacker').firestore();
  await assertFails(setDoc(doc(attackerDb, 'properties', 'stolen-property'), {
    title: 'Not my property',
    city: 'Guwahati',
    ownerUid: 'victim',
    ownerId: 'victim',
  }));
});

test('owners cannot self-assign verification, featured status, ratings, or paid plans during property creation', async () => {
  const ownerDb = testEnv.authenticatedContext('owner-create').firestore();
  const base = {
    title: 'New Homestay',
    city: 'Guwahati',
    ownerUid: 'owner-create',
    ownerId: 'owner-create',
    status: 'active',
    isVerified: false,
    isFeatured: false,
    rating: 0,
    reviewsCount: 0,
    subscriptionPlan: 'none',
    subscriptionPrice: 0,
    subscriptionExpiresAt: '',
    subscriptionExpiryDate: '',
  };
  await assertSucceeds(setDoc(doc(ownerDb, 'properties', 'safe-create'), base));
  await assertFails(setDoc(doc(ownerDb, 'properties', 'fake-verified'), {
    ...base, isVerified: true,
  }));
  await assertFails(setDoc(doc(ownerDb, 'properties', 'fake-featured'), {
    ...base, isFeatured: true,
  }));
  await assertFails(setDoc(doc(ownerDb, 'properties', 'fake-rating'), {
    ...base, rating: 5, reviewsCount: 100,
  }));
  await assertFails(setDoc(doc(ownerDb, 'properties', 'fake-paid'), {
    ...base, subscriptionPlan: 'standard_1500', subscriptionPrice: 1500,
    subscriptionExpiresAt: '2099-01-01T00:00:00.000Z',
  }));
  await assertFails(setDoc(doc(ownerDb, 'properties', 'extra-admin-field'), {
    ...base, adminApproved: true,
  }));
});

test('owners can edit listing content but cannot grant themselves verification or boosts', async () => {
  const ownerDb = await createOwnedProperty();
  await assertSucceeds(updateDoc(doc(ownerDb, 'properties', 'property-1'), {
    title: 'Updated Homestay',
  }));
  await assertFails(updateDoc(doc(ownerDb, 'properties', 'property-1'), {
    isVerified: true,
  }));
  await assertFails(updateDoc(doc(ownerDb, 'properties', 'property-1'), {
    isFeatured: true,
  }));
  await assertFails(updateDoc(doc(ownerDb, 'properties', 'property-1'), {
    subscriptionExpiresAt: '2099-01-01T00:00:00.000Z',
  }));
});

test('only the owner of a property can create and edit its rooms', async () => {
  const ownerDb = await createOwnedProperty();
  const attackerDb = testEnv.authenticatedContext('attacker').firestore();
  await assertSucceeds(setDoc(doc(ownerDb, 'rooms', 'room-1'), {
    propertyId: 'property-1',
    roomName: 'Deluxe Room',
    ownerUid: 'owner-1',
  }));
  await assertFails(setDoc(doc(attackerDb, 'rooms', 'room-2'), {
    propertyId: 'property-1',
    roomName: 'Fake Room',
    ownerUid: 'attacker',
  }));
});

test('public enquiries must reference a real property and valid guest details', async () => {
  await createOwnedProperty();
  const publicDb = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(setDoc(doc(publicDb, 'enquiries', 'enquiry-1'), {
    propertyId: 'property-1',
    customerName: 'Guest',
    customerPhone: '9876543210',
  }));
  await assertFails(setDoc(doc(publicDb, 'enquiries', 'enquiry-invalid'), {
    propertyId: 'missing-property',
    customerName: 'Guest',
    customerPhone: '9876543210',
  }));
  await assertFails(setDoc(doc(publicDb, 'enquiries', 'enquiry-extra-field'), {
    propertyId: 'property-1',
    customerName: 'Guest',
    customerPhone: '9876543210',
    isAdmin: true,
  }));
});

test('owners can query only enquiries for their own property', async () => {
  const ownerDb = await createOwnedProperty();
  const publicDb = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(setDoc(doc(publicDb, 'enquiries', 'enquiry-1'), {
    propertyId: 'property-1',
    customerName: 'Guest',
    customerPhone: '9876543210',
  }));
  const ownQuery = query(collection(ownerDb, 'enquiries'), where('propertyId', '==', 'property-1'));
  const results = await assertSucceeds(getDocs(ownQuery));
  assert.equal(results.size, 1);

  const attackerDb = testEnv.authenticatedContext('attacker').firestore();
  const forbiddenQuery = query(collection(attackerDb, 'enquiries'), where('propertyId', '==', 'property-1'));
  await assertFails(getDocs(forbiddenQuery));
});

test('public analytics writes must reference an existing property; owners can read their own records', async () => {
  const ownerDb = await createOwnedProperty();
  const publicDb = testEnv.unauthenticatedContext().firestore();

  await assertSucceeds(setDoc(doc(publicDb, 'visits', 'visit-1'), {
    propertyId: 'property-1',
    refId: 'qr-owner',
    timestamp: new Date().toISOString(),
    source: 'qr_referral',
  }));
  await assertFails(setDoc(doc(publicDb, 'leads', 'lead-invalid'), {
    propertyId: 'missing-property',
    refId: 'qr-owner',
    timestamp: new Date().toISOString(),
  }));

  const ownVisits = query(collection(ownerDb, 'visits'), where('propertyId', '==', 'property-1'));
  const results = await assertSucceeds(getDocs(ownVisits));
  assert.equal(results.size, 1);
});

test('users cannot grant themselves the admin role', async () => {
  const userDb = testEnv.authenticatedContext('new-user').firestore();
  await assertFails(setDoc(doc(userDb, 'users', 'new-user'), {
    id: 'new-user',
    email: 'user@example.com',
    role: 'admin',
  }));
  await assertSucceeds(setDoc(doc(userDb, 'users', 'new-user'), {
    id: 'new-user',
    email: 'user@example.com',
    role: 'owner',
  }));
});
