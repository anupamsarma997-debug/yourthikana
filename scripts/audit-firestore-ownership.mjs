import { applicationDefault, initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { writeFile } from 'node:fs/promises';

const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
if (!projectId) {
  console.error('Set GOOGLE_CLOUD_PROJECT to the Firebase project ID.');
  process.exit(1);
}

const app = getApps()[0] || initializeApp({
  credential: applicationDefault(),
  projectId,
});
const db = getFirestore(app);
const auth = getAuth(app);

async function authUserExists(uid) {
  if (typeof uid !== 'string' || !uid.trim()) return false;
  try {
    await auth.getUser(uid);
    return true;
  } catch (error) {
    if (error?.code === 'auth/user-not-found' || error?.code === 'auth/invalid-uid') return false;
    throw error;
  }
}

const [propertiesSnapshot, roomsSnapshot] = await Promise.all([
  db.collection('properties').get(),
  db.collection('rooms').get(),
]);

const propertyById = new Map(propertiesSnapshot.docs.map((doc) => [doc.id, doc.data()]));
const authChecks = new Map();
const checkUid = async (uid) => {
  if (!uid) return false;
  if (!authChecks.has(uid)) authChecks.set(uid, authUserExists(uid));
  return authChecks.get(uid);
};

const propertyRows = [];
for (const doc of propertiesSnapshot.docs) {
  const data = doc.data();
  const ownerUid = typeof data.ownerUid === 'string' ? data.ownerUid.trim() : '';
  const legacyOwnerId = typeof data.ownerId === 'string' ? data.ownerId.trim() : '';
  const [ownerUidExists, legacyOwnerIdIsAuthUid] = await Promise.all([
    checkUid(ownerUid),
    ownerUid ? Promise.resolve(false) : checkUid(legacyOwnerId),
  ]);
  propertyRows.push({
    documentId: doc.id,
    ownerUidPresent: Boolean(ownerUid),
    ownerUidExistsInAuth: ownerUid ? ownerUidExists : null,
    legacyOwnerIdPresent: Boolean(legacyOwnerId),
    legacyOwnerIdIsFirebaseUid: !ownerUid && legacyOwnerId ? legacyOwnerIdIsAuthUid : null,
    ownerEmailFieldPresent: Object.prototype.hasOwnProperty.call(data, 'ownerEmail'),
    ownerUidNeedsReview: !ownerUid || !ownerUidExists,
  });
}

const roomRows = [];
for (const doc of roomsSnapshot.docs) {
  const data = doc.data();
  const propertyId = typeof data.propertyId === 'string' ? data.propertyId : '';
  const parent = propertyById.get(propertyId);
  const roomOwnerUid = typeof data.ownerUid === 'string' ? data.ownerUid.trim() : '';
  const propertyOwnerUid = typeof parent?.ownerUid === 'string' ? parent.ownerUid.trim() : '';
  roomRows.push({
    documentId: doc.id,
    propertyExists: Boolean(parent),
    ownerUidPresent: Boolean(roomOwnerUid),
    parentPropertyOwnerUidPresent: Boolean(propertyOwnerUid),
    roomOwnerMatchesPropertyOwner: Boolean(roomOwnerUid && propertyOwnerUid && roomOwnerUid === propertyOwnerUid),
    needsReview: !parent || !roomOwnerUid || !propertyOwnerUid || roomOwnerUid !== propertyOwnerUid,
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  projectId,
  mode: 'READ_ONLY_NO_DOCUMENTS_MODIFIED',
  summary: {
    propertiesScanned: propertyRows.length,
    propertiesNeedingReview: propertyRows.filter((row) => row.ownerUidNeedsReview || row.ownerEmailFieldPresent).length,
    roomsScanned: roomRows.length,
    roomsNeedingReview: roomRows.filter((row) => row.needsReview).length,
    ownerEmailFieldsFound: propertyRows.filter((row) => row.ownerEmailFieldPresent).length,
  },
  properties: propertyRows,
  rooms: roomRows,
};

const outputPath = `firestore-ownership-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
await writeFile(outputPath, JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify(report.summary, null, 2));
console.log(`Read-only audit saved to ${outputPath}. No Firestore documents were changed.`);
