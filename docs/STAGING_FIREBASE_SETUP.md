# Safe Preview / Staging Firebase Setup

## Why this is required

The Vercel Preview environment has previously been configured to use the same Firebase project as Production. Until Preview has its own Firebase project, do not create test users, properties, subscription requests, verification requests, payment proofs, or other Firestore/Storage data on Preview.

## Create a separate Firebase project

1. Open Firebase Console and create a new project dedicated to staging (for example, yourthikana-staging; the project ID must be available).
2. Add a separate Web App in that staging project.
3. Enable the same Authentication providers used by the app: Google and Email/Password.
4. Create a Firestore database in the required region and create the Storage bucket.
5. Add the stable Vercel Preview branch domain to Firebase Authentication's authorized domains. Do not add broad or unrelated domains.
6. Keep App Check enforcement OFF until the staging domain, reCAPTCHA Enterprise configuration, token acquisition and service requests have been verified.

## Configure Vercel Preview variables only

In Vercel → Project iitg-tic → Settings → Environment Variables, add or update these variables with values from the staging Firebase Web App. Select Preview only for each one:

- VITE_FIREBASE_API_KEY
- VITE_FIREBASE_AUTH_DOMAIN
- VITE_FIREBASE_PROJECT_ID
- VITE_FIREBASE_STORAGE_BUCKET
- VITE_FIREBASE_MESSAGING_SENDER_ID
- VITE_FIREBASE_APP_ID
- FIREBASE_WEB_API_KEY (same staging Web API key; the server can also read VITE_FIREBASE_API_KEY)

Do not select Production for these staging values. Do not delete or overwrite the existing Production values.

If Gemini-backed AI is to be tested in Preview, configure GEMINI_API_KEY for Preview as a server-only variable; never prefix it with VITE_.

## Verify isolation before testing

1. Redeploy a Preview after the Preview-only variables are saved.
2. Open the Preview and confirm its Firebase project ID is the staging project, not yourthikana-e53a5.
3. Confirm Google and Email/Password sign-in work in staging.
4. Confirm a test property created in staging is visible only in staging and does not appear on the Production website.
5. Only after these checks, run the owner, admin, uploads, subscription, Search Boost, Blue Tick and AI test flows.

## Safety boundary

- Never run test transactions or upload personal/property documents against Production.
- Never paste service-account private keys, passwords, or other secrets into chat.
- Do not deploy Firestore or Storage rules to Production as part of staging setup.
- Keep App Check enforcement disabled until its complete end-to-end setup is proven.
- A staging project is separate from Production even if both use the same Firebase region or billing plan.
