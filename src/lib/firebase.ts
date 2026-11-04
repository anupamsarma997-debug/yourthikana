import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';

// Safely attempt to load firebase-applet-config.json if present
let config: Record<string, any> = {};
try {
  const configs = import.meta.glob(['/firebase-applet-config.json', '../../firebase-applet-config.json', '../firebase-applet-config.json'], { eager: true });
  const keys = Object.keys(configs);
  if (keys.length > 0) {
    config = ((configs[keys[0]] as any).default || configs[keys[0]]) as Record<string, any>;
  }
} catch {
  // Config file omitted or ignored in Git
}

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || config.apiKey;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || config.projectId;

// Check if valid Firebase credentials are provided
export const isFirebaseConfigured = Boolean(apiKey && projectId);

const firebaseConfig = {
  apiKey: apiKey || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || config.authDomain || '',
  projectId: projectId || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || config.storageBucket || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || config.messagingSenderId || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || config.appId || '',
};

let app: any = null;
let db: any = null;
let auth: any = null;
let storage: any = null;
let appCheck: AppCheck | null = null;
let firebaseConfigError: string | null = null;

if (isFirebaseConfigured) {
  try {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID || config.firestoreDatabaseId;
    if (databaseId && databaseId !== '(default)') {
      try {
        db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true }, databaseId);
      } catch {
        db = getFirestore(app, databaseId);
      }
    } else {
      try {
        db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
      } catch {
        db = getFirestore(app);
      }
    }
    auth = getAuth(app);
    storage = getStorage(app);

    // App Check is opt-in until a site key is configured and verified in Firebase.
    // Do not enable Firebase enforcement before this client initialization is deployed.
    const appCheckSiteKey = (import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY || '').trim();
    if (appCheckSiteKey) {
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    }
  } catch (e: any) {
    firebaseConfigError = e?.message || String(e);
    console.error('Firebase initialization error:', e);
  }
} else {
  firebaseConfigError = 'Firebase configuration is missing or incomplete.';
}

export interface FirebaseDiagnostic {
  isConfigured: boolean;
  isGoogleAuthReady: boolean;
  missingVars: string[];
  loadedVars: Record<string, boolean>;
  authInitialized: boolean;
  errorMessage: string | null;
}

export const checkFirebaseDiagnostics = (): FirebaseDiagnostic => {
  const loadedVars: Record<string, boolean> = {
    VITE_FIREBASE_API_KEY: Boolean(firebaseConfig.apiKey),
    VITE_FIREBASE_AUTH_DOMAIN: Boolean(firebaseConfig.authDomain),
    VITE_FIREBASE_PROJECT_ID: Boolean(firebaseConfig.projectId),
    VITE_FIREBASE_STORAGE_BUCKET: Boolean(firebaseConfig.storageBucket),
    VITE_FIREBASE_MESSAGING_SENDER_ID: Boolean(firebaseConfig.messagingSenderId),
    VITE_FIREBASE_APP_ID: Boolean(firebaseConfig.appId),
  };

  const missingVars = Object.keys(loadedVars).filter((key) => !loadedVars[key]);
  const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
  const authInitialized = Boolean(auth);
  const isGoogleAuthReady = Boolean(auth && googleProvider && firebaseConfig.apiKey && firebaseConfig.authDomain);

  let errorMessage: string | null = null;
  if (missingVars.length > 0) {
    errorMessage = `Missing runtime env variables: ${missingVars.join(', ')}`;
  } else if (!authInitialized) {
    errorMessage = firebaseConfigError || 'Firebase Auth service is not initialized.';
  } else if (!isGoogleAuthReady) {
    errorMessage = 'Google Auth provider is missing necessary credentials or Auth Domain configuration.';
  }

  return {
    isConfigured,
    isGoogleAuthReady,
    missingVars,
    loadedVars,
    authInitialized,
    errorMessage,
  };
};

export { app, db, auth, storage, appCheck, firebaseConfigError };
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});
export default app;


