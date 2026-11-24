import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, Timestamp, writeBatch } from 'firebase/firestore';

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
      title: 'Test property',
      status: 'active',
      subscriptionTrialEndsAtTimestamp: Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000),
      subscriptionExpiresAtTimestamp: Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000),
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
    proofSubmissionMethod: 'whatsapp_share',
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

test('monthly subscription cannot be requested without an expired six-month trial', async () => {
  const ownerDb = env.authenticatedContext('owner-1').firestore();
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'properties', 'property-without-trial'), {
      id: 'property-without-trial', ownerUid: 'owner-1', ownerId: 'owner-1',
      title: 'No trial record', status: 'active',
    });
    await updateDoc(doc(context.firestore(), 'properties', 'active-property'), {
      subscriptionTrialEndsAtTimestamp: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
      subscriptionExpiresAtTimestamp: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
    });
  });
  await assertFails(setDoc(doc(ownerDb, 'subscriptionApplications', 'sub-without-trial-record'), applicationData({ propertyId: 'property-without-trial' })));
  await assertFails(setDoc(doc(ownerDb, 'subscriptionApplications', 'sub-during-trial'), applicationData()));
  await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'properties', 'active-property'), {
      subscriptionTrialEndsAtTimestamp: Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000),
      subscriptionExpiresAtTimestamp: Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000),
    });
  });
  await assertSucceeds(setDoc(doc(ownerDb, 'subscriptionApplications', 'sub-after-trial'), applicationData()));
});

test('an expired hidden property can request renewal but an active paid subscription cannot renew early', async () => {
  const ownerDb = env.authenticatedContext('owner-1').firestore();
  await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'properties', 'active-property'), { status: 'hidden_expired' });
  });
  await assertSucceeds(setDoc(doc(ownerDb, 'subscriptionApplications', 'sub-hidden-renewal'), applicationData()));
  await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'properties', 'active-property'), {
      status: 'active',
      subscriptionExpiresAtTimestamp: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
    });
  });
  await assertFails(setDoc(doc(ownerDb, 'subscriptionApplications', 'sub-early-renewal'), applicationData()));
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
    proofSubmissionMethod: 'whatsapp_share',
    proofStatus: 'awaiting_manual_review',
  }));
});

test('owner cannot self-activate or extend subscription and badge expiry', async () => {
  const ownerDb = env.authenticatedContext('owner-1').firestore();
  const propertyRef = doc(ownerDb, 'properties', 'active-property');
  await assertFails(updateDoc(propertyRef, { subscriptionStatus: 'active' }));
  await assertFails(updateDoc(propertyRef, { subscriptionExpiresAt: '2099-01-01T00:00:00.000Z' }));
  await assertFails(updateDoc(propertyRef, { subscriptionExpiresAtTimestamp: Timestamp.fromDate(new Date('2099-01-01T00:00:00.000Z')) }));
  await assertFails(updateDoc(propertyRef, { verifiedUntil: '2099-01-01T00:00:00.000Z' }));
  await assertFails(updateDoc(propertyRef, { featuredUntil: '2099-01-01T00:00:00.000Z' }));
});


test('Search Boost UTR submission records WhatsApp manual review state', async () => {
  const ownerDb = env.authenticatedContext('owner-1').firestore();
  const applicationRef = doc(ownerDb, 'searchBoostApplications', 'boost-1');
  await setDoc(applicationRef, {
    ownerUid: 'owner-1',
    propertyId: 'active-property',
    propertyTitle: 'Test property',
    status: 'awaiting_payment',
    paymentStatus: 'pending',
    paymentUtr: '',
    proofSubmissionMethod: 'whatsapp_share',
    proofStatus: 'awaiting_payment',
    submittedAt: Timestamp.now(),
  });
  await assertSucceeds(updateDoc(applicationRef, {
    status: 'pending',
    paymentStatus: 'pending',
    paymentUtr: 'BOOST12345678',
    paymentSubmittedAt: Timestamp.now(),
    proofSubmissionMethod: 'whatsapp_share',
    proofStatus: 'awaiting_manual_review',
  }));
});

test('another owner cannot create a Search Boost application for someone else property', async () => {
  const otherDb = env.authenticatedContext('owner-2').firestore();
  await assertFails(setDoc(doc(otherDb, 'searchBoostApplications', 'boost-other'), {
    ownerUid: 'owner-2',
    propertyId: 'active-property',
    propertyTitle: 'Test property',
    status: 'awaiting_payment',
    paymentStatus: 'pending',
    paymentUtr: '',
    proofSubmissionMethod: 'whatsapp_share',
    proofStatus: 'awaiting_payment',
    submittedAt: Timestamp.now(),
  }));
});

test('only the verified platform admin can activate a paid subscription and write its transaction', async () => {
  const ownerDb = env.authenticatedContext('owner-1').firestore();
  const applicationRef = doc(ownerDb, 'subscriptionApplications', 'sub-admin-test');
  await setDoc(applicationRef, applicationData());
  await assertSucceeds(updateDoc(applicationRef, { status: 'pending', paymentStatus: 'pending', paymentUtr: 'ADMIN12345678', paymentSubmittedAt: Timestamp.now(), proofSubmissionMethod: 'whatsapp_share', proofStatus: 'awaiting_manual_review' }));
  await assertFails(updateDoc(applicationRef, { status: 'approved', verifiedUntil: '2026-12-24T00:00:00.000Z' }));
  await assertFails(setDoc(doc(ownerDb, 'transactions', 'subscription-sub-admin-test'), { amount: 1000 }));

  const adminDb = env.authenticatedContext('admin-1', {
    email: 'anupamsarma997@gmail.com',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  }).firestore();
  const expiry = '2026-12-24T00:00:00.000Z';
  const batch = writeBatch(adminDb);
  batch.update(doc(adminDb, 'subscriptionApplications', 'sub-admin-test'), { status: 'approved', verifiedUntil: expiry, reviewedAt: Timestamp.now(), reviewedBy: 'admin-1' });
  batch.update(doc(adminDb, 'properties', 'active-property'), { subscriptionStatus: 'active', subscriptionPlan: 'standard_1000', subscriptionPrice: 1000, subscriptionExpiresAt: expiry, subscriptionExpiresAtTimestamp: Timestamp.fromDate(new Date(expiry)), subscriptionExpiryDate: expiry });
  batch.set(doc(adminDb, 'transactions', 'subscription-sub-admin-test'), { id: 'subscription-sub-admin-test', ownerId: 'owner-1', propertyId: 'active-property', amount: 1000, type: 'standard_1000' });
  await assertSucceeds(batch.commit());
});

test('monthly subscription application is private to its owner and platform admin', async () => {
  const ownerDb = env.authenticatedContext('owner-1').firestore();
  const otherDb = env.authenticatedContext('owner-2').firestore();
  const applicationRef = doc(ownerDb, 'subscriptionApplications', 'sub-private');
  await setDoc(applicationRef, applicationData());
  await assertSucceeds(getDoc(applicationRef));
  await assertFails(getDoc(doc(otherDb, 'subscriptionApplications', 'sub-private')));
  const adminDb = env.authenticatedContext('admin-1', { email: 'anupamsarma997@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();
  await assertSucceeds(getDoc(doc(adminDb, 'subscriptionApplications', 'sub-private')));
});

test('owner cannot self-verify or self-approve a monthly subscription payment', async () => {
  const ownerDb = env.authenticatedContext('owner-1').firestore();
  const applicationRef = doc(ownerDb, 'subscriptionApplications', 'sub-self-approve');
  await setDoc(applicationRef, applicationData());
  await assertSucceeds(updateDoc(applicationRef, {
    status: 'pending',
    paymentStatus: 'pending',
    paymentUtr: 'OWNER12345678',
    paymentSubmittedAt: Timestamp.now(),
    proofSubmissionMethod: 'whatsapp_share',
    proofStatus: 'awaiting_manual_review',
  }));
  await assertFails(updateDoc(applicationRef, { paymentStatus: 'verified' }));
  await assertFails(updateDoc(applicationRef, { status: 'approved', verifiedUntil: '2026-12-24T00:00:00.000Z' }));
});
