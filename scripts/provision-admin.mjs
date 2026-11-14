import { applicationDefault, initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const emailArg = process.argv.find((arg) => arg.startsWith('--email='));
const email = emailArg?.slice('--email='.length).trim().toLowerCase();
const apply = process.argv.includes('--apply');
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;

if (!projectId || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: GOOGLE_CLOUD_PROJECT=yourthikana-e53a5 node scripts/provision-admin.mjs --email=YOUR_AUTH_EMAIL [--apply]');
  process.exit(1);
}

const app = getApps()[0] || initializeApp({
  credential: applicationDefault(),
  projectId,
});
const auth = getAuth(app);
const user = await auth.getUserByEmail(email);
const existingClaims = user.customClaims || {};

if (!apply) {
  console.log('DRY RUN: target Firebase Auth account exists.');
  console.log(`UID: ${user.uid}`);
  console.log(`Admin claim currently set: ${existingClaims.admin === true}`);
  console.log('No claims changed. Add --apply only after confirming this is the intended administrator account.');
  process.exit(0);
}

await auth.setCustomUserClaims(user.uid, { ...existingClaims, admin: true });
const verified = await auth.getUser(user.uid);
if (verified.customClaims?.admin !== true) {
  throw new Error('Admin custom claim could not be verified after update.');
}
console.log('SUCCESS: trusted Firebase Auth admin custom claim set and verified.');
console.log(`UID: ${user.uid}`);
console.log('The user must sign out and sign in again (or refresh the ID token) before the new claim appears.');
