import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const appDir = process.cwd();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // The app is deployed behind one trusted reverse proxy in hosted environments.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.setHeader('Pragma', 'no-cache');
    }
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  // Lightweight per-process abuse protection for paid Gemini endpoints.
  // For multi-instance deployments, also configure a shared edge/API rate limit.
  const aiRateLimitWindowMs = 10 * 60 * 1000;
  const aiRateLimitMaxRequests = 12;
  const aiRateLimitMaxBuckets = 5000;
  const aiRequestBuckets = new Map<string, { count: number; resetAt: number }>();
  const aiRateLimit = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const now = Date.now();
    for (const [key, bucket] of aiRequestBuckets) {
      if (bucket.resetAt <= now) aiRequestBuckets.delete(key);
    }
    const key = req.ip || 'unknown';
    let bucket = aiRequestBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      // Bound memory use if many distinct client IPs hit a warm server instance.
      if (aiRequestBuckets.size >= aiRateLimitMaxBuckets) {
        const oldestKey = aiRequestBuckets.keys().next().value;
        if (oldestKey) aiRequestBuckets.delete(oldestKey);
      }
      bucket = { count: 0, resetAt: now + aiRateLimitWindowMs };
      aiRequestBuckets.set(key, bucket);
    }
    if (bucket.count >= aiRateLimitMaxRequests) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many AI requests. Please wait a few minutes and try again.' });
    }
    bucket.count += 1;
    return next();
  };
  app.use('/api/ai', aiRateLimit);

  // Initialize Gemini AI Client lazily/safely
  const getGenAI = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is missing.');
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  // Secure username authentication. Credentials are verified by Firebase Auth;
  // Firestore username mappings are written/read only by this Admin SDK endpoint.
  const usernameRateBuckets = new Map<string, { count: number; resetAt: number }>();
  const getFirebaseAdmin = async () => {
    const [{ getApps, initializeApp, cert }, { getAuth }, { getFirestore }] = await Promise.all([
      import('firebase-admin/app'),
      import('firebase-admin/auth'),
      import('firebase-admin/firestore'),
    ]);
    let adminApp = getApps().find((item) => item.name === 'yourthikana-server');
    if (!adminApp) {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not configured');
      const serviceAccount = JSON.parse(raw);
      if (serviceAccount.private_key) serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      adminApp = initializeApp({ credential: cert(serviceAccount) }, 'yourthikana-server');
    }
    return { auth: getAuth(adminApp), db: getFirestore(adminApp) };
  };
  const usernameRateLimit = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const now = Date.now();
    for (const [bucketKey, bucketValue] of usernameRateBuckets) {
      if (bucketValue.resetAt <= now) usernameRateBuckets.delete(bucketKey);
    }
    const key = req.ip || 'unknown';
    let bucket = usernameRateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (usernameRateBuckets.size >= 5000) {
        const oldestKey = usernameRateBuckets.keys().next().value;
        if (oldestKey) usernameRateBuckets.delete(oldestKey);
      }
      bucket = { count: 0, resetAt: now + 10 * 60 * 1000 };
      usernameRateBuckets.set(key, bucket);
    }
    if (bucket.count >= 8) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many sign-in attempts. Wait a few minutes and try again.' });
    }
    bucket.count += 1;
    return next();
  };
  const normalizeUsername = (value: unknown) =>
    typeof value === 'string' ? value.trim().replace(/^@/, '').toLowerCase() : '';

  app.post('/api/auth/claim-username', usernameRateLimit, async (req, res) => {
    try {
      const authorization = req.headers.authorization || '';
      const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      if (!idToken) return res.status(401).json({ error: 'Please sign in again to finish account setup.' });
      const username = normalizeUsername(req.body?.username);
      if (!/^[a-z0-9_]{3,20}$/.test(username) || ['admin', 'administrator', 'support', 'help', 'yourthikana', 'thikana', 'null', 'undefined'].includes(username)) {
        return res.status(400).json({ error: 'Username must be 3–20 characters using letters, numbers or underscore.' });
      }
      const { auth: adminAuth, db: adminDb } = await getFirebaseAdmin();
      const decoded = await adminAuth.verifyIdToken(idToken);
      const authUser = await adminAuth.getUser(decoded.uid);
      if (!authUser.email) return res.status(400).json({ error: 'A verified Firebase account email is required.' });
      const usernameRef = adminDb.collection('username_index').doc(username);
      // Protect usernames already present on older accounts before the index existed.
      const legacyMatches = await adminDb.collection('users').where('username', '==', username).limit(2).get();
      if (legacyMatches.docs.some((legacyDoc) => legacyDoc.id !== decoded.uid)) {
        return res.status(409).json({ error: 'This username is already taken. Please choose another.' });
      }
      await adminDb.runTransaction(async (tx) => {
        const existing = await tx.get(usernameRef);
        if (existing.exists && existing.data()?.uid !== decoded.uid) {
          const error: any = new Error('USERNAME_TAKEN');
          error.code = 'USERNAME_TAKEN';
          throw error;
        }
        tx.set(usernameRef, { uid: decoded.uid, username, createdAt: existing.exists ? existing.data()?.createdAt || new Date().toISOString() : new Date().toISOString() });
        tx.set(adminDb.collection('users').doc(decoded.uid), {
          id: decoded.uid, username, email: authUser.email,
          name: authUser.displayName || authUser.email.split('@')[0],
        }, { merge: true });
        tx.set(adminDb.collection('public_profiles').doc(decoded.uid), {
          id: decoded.uid, username,
          name: authUser.displayName || authUser.email.split('@')[0],
        }, { merge: true });
      });
      return res.json({ success: true, username });
    } catch (error: any) {
      if (error?.code === 'USERNAME_TAKEN') return res.status(409).json({ error: 'This username is already taken. Please choose another.' });
      if (error?.code === 'auth/id-token-expired' || error?.code === 'auth/argument-error') return res.status(401).json({ error: 'Your sign-in session expired. Please sign in again.' });
      console.error('Username claim failed:', error?.message || error);
      return res.status(500).json({ error: 'Username setup is temporarily unavailable. Please try again.' });
    }
  });

  app.post('/api/auth/username-status', usernameRateLimit, async (req, res) => {
    try {
      const authorization = req.headers.authorization || '';
      const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      if (!idToken) return res.status(401).json({ error: 'Please sign in again.' });
      const { auth: adminAuth, db: adminDb } = await getFirebaseAdmin();
      const decoded = await adminAuth.verifyIdToken(idToken);
      const [account, profileSnap] = await Promise.all([
        adminAuth.getUser(decoded.uid),
        adminDb.collection('users').doc(decoded.uid).get(),
      ]);
      const profileUsername = normalizeUsername(profileSnap.data()?.username);
      if (profileUsername && /^[a-z0-9_]{3,20}$/.test(profileUsername)) {
        const usernameRef = adminDb.collection('username_index').doc(profileUsername);
        const existing = await usernameRef.get();
        if (existing.exists && existing.data()?.uid !== decoded.uid) {
          return res.json({ complete: false, username: '' });
        }
        if (!existing.exists) {
          const legacyMatches = await adminDb.collection('users').where('username', '==', profileUsername).limit(2).get();
          if (!legacyMatches.docs.some((doc) => doc.id !== decoded.uid)) {
            await adminDb.runTransaction(async (tx) => {
              const current = await tx.get(usernameRef);
              if (!current.exists) tx.create(usernameRef, { uid: decoded.uid, username: profileUsername, createdAt: new Date().toISOString() });
            });
          }
        }
        const confirmed = await usernameRef.get();
        if (confirmed.exists && confirmed.data()?.uid === decoded.uid) {
          return res.json({ complete: true, username: profileUsername });
        }
      }
      const suggested = normalizeUsername(account.email?.split('@')[0] || '').slice(0, 20);
      return res.json({ complete: false, username: /^[a-z0-9_]{3,20}$/.test(suggested) ? suggested : '' });
    } catch (error: any) {
      console.error('Username status check failed:', error?.message || error);
      return res.status(500).json({ error: 'Could not verify account setup. Please try again.' });
    }
  });

  app.post('/api/auth/username-login', usernameRateLimit, async (req, res) => {
    try {
      const username = normalizeUsername(req.body?.username);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!/^[a-z0-9_]{3,20}$/.test(username) || !password || password.length > 128) {
        return res.status(400).json({ error: 'Enter a valid username and password.' });
      }
      const { auth: adminAuth, db: adminDb } = await getFirebaseAdmin();
      const usernameRef = adminDb.collection('username_index').doc(username);
      let mapping = await usernameRef.get();
      // One-time compatibility migration for an older profile with a unique exact username.
      if (!mapping.exists) {
        const legacy = await adminDb.collection('users').where('username', '==', username).limit(2).get();
        if (legacy.size === 1) {
          const uid = legacy.docs[0].id;
          await adminDb.runTransaction(async (tx) => {
            const current = await tx.get(usernameRef);
            if (!current.exists) tx.create(usernameRef, { uid, username, createdAt: new Date().toISOString() });
          });
          mapping = await usernameRef.get();
        }
      }
      const uid = mapping.data()?.uid;
      if (!mapping.exists || typeof uid !== 'string') {
        return res.status(401).json({ error: 'Incorrect username or password.' });
      }
      const account = await adminAuth.getUser(uid);
      if (!account.email || account.disabled) {
        return res.status(401).json({ error: 'Incorrect username or password.' });
      }
      const apiKey = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY;
      if (!apiKey) throw new Error('Firebase web API key is not configured on the server');
      const identityResponse = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: account.email, password, returnSecureToken: true }),
      });
      const identityResult: any = await identityResponse.json().catch(() => ({}));
      if (!identityResponse.ok || identityResult.localId !== uid) {
        return res.status(401).json({ error: 'Incorrect username or password.' });
      }
      const customToken = await adminAuth.createCustomToken(uid);
      return res.json({ customToken });
    } catch (error: any) {
      console.error('Username sign-in failed:', error?.message || error);
      return res.status(500).json({ error: 'Username sign-in is temporarily unavailable. Please try again.' });
    }
  });

  // Owner-only AI tools must receive a Firebase ID token. The owner role is
  // read from the private UID-keyed profile; admin access requires a trusted claim.
  const requireOwnerAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const authorization = req.headers.authorization || '';
      const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      if (!idToken) return res.status(401).json({ error: 'Please sign in with your owner account to use this tool.' });
      const { auth: adminAuth, db: adminDb } = await getFirebaseAdmin();
      const decoded = await adminAuth.verifyIdToken(idToken);
      if (decoded.admin !== true) {
        const profile = await adminDb.collection('users').doc(decoded.uid).get();
        if (!profile.exists || profile.data()?.role !== 'owner') {
          return res.status(403).json({ error: 'An owner account is required to use this tool.' });
        }
      }
      return next();
    } catch (error: any) {
      if (error?.code === 'auth/id-token-expired' || error?.code === 'auth/argument-error' || error?.code === 'auth/invalid-id-token') {
        return res.status(401).json({ error: 'Your sign-in session expired. Please sign in again.' });
      }
      console.error('Owner AI authorization failed:', error?.message || error);
      return res.status(503).json({ error: 'Owner verification is temporarily unavailable. Please try again.' });
    }
  };

  // Health API
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', app: 'THIKANA Marketplace', time: new Date().toISOString() });
  });

  // Input Sanitizer Helper to prevent Prompt Injection & excessive payload sizes
  const sanitizeInput = (val: any, maxLen = 500): string => {
    if (typeof val !== 'string') return '';
    // Strip system control characters and limit length
    return val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim().slice(0, maxLen);
  };



  // AI Helper 1: Generate Listing Description (Zero Hallucinations, strictly grounded in owner factual data)
  app.post('/api/ai/generate-description', requireOwnerAuth, async (req, res) => {
    try {
      const propertyName = sanitizeInput(req.body.propertyName, 100);
      if (!propertyName) {
        return res.status(400).json({ error: 'Property name is required' });
      }
      const propertyType = sanitizeInput(req.body.propertyType, 50) || 'Homestay';
      const city = sanitizeInput(req.body.city, 100);
      const state = sanitizeInput(req.body.state, 100);
      const address = sanitizeInput(req.body.address, 150);
      const nearbyAttractions = sanitizeInput(req.body.nearbyAttractions || req.body.keyFeatures, 300);
      const amenities = Array.isArray(req.body.amenities)
        ? req.body.amenities.map((a: any) => sanitizeInput(a, 50)).filter(Boolean).slice(0, 20)
        : [];

      const ai = getGenAI();

      // Assemble only factual data provided
      const facts: string[] = [
        `Property Name: ${propertyName}`,
        `Property Type: ${propertyType}`,
      ];
      if (city) facts.push(`City: ${city}`);
      if (state) facts.push(`State: ${state}`);
      if (address) facts.push(`Address: ${address}`);
      if (nearbyAttractions) facts.push(`Nearby Attractions / Landmarks: ${nearbyAttractions}`);
      if (amenities.length > 0) {
        facts.push(`Amenities / Facilities: ${amenities.join(', ')}`);
      } else {
        facts.push(`Amenities / Facilities: None specified by owner`);
      }

      const prompt = `Generate a property description using ONLY the supplied factual data. Do not add assumptions, marketing claims, amenities, attractions, distances, views, services, meals, ratings or facilities that are not present in the supplied data.

SUPPLIED FACTUAL DATA:
${facts.join('\n')}

STRICT RULES (ZERO HALLUCINATIONS):
1. You must NEVER invent or assume any amenity, feature, or facility not listed above (including but not limited to: WiFi, meals, breakfast, tea, restaurant, scenic views, mountain views, river views, hot water, geyser, parking, AC, heater, fireplace, balcony, safari booking, distance, ratings, reviews, awards, or verification).
2. If an amenity, view, service, meal, or attraction is not listed in the supplied data, do NOT mention or imply it.
3. Write a concise, factual description (under 120 words) strictly using only the supplied facts.
4. Mention that guests connect directly with the host on WhatsApp with zero commission.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
      });

      res.json({ description: response.text || '' });
    } catch (error: any) {
      console.error('Error generating AI description:', error);
      res.status(500).json({ error: 'Failed to generate AI description. Please try again later.' });
    }
  });

  // AI Helper 2: Generate Nearby Attractions
  app.post('/api/ai/nearby-attractions', requireOwnerAuth, async (req, res) => {
    try {
      const city = sanitizeInput(req.body.city, 100);
      const address = sanitizeInput(req.body.address, 150);
      if (!city) return res.status(400).json({ error: 'City is required to suggest nearby attractions.' });
      const ai = getGenAI();

      const prompt = `Suggest up to 4 nearby places around "${address ? address + ', ' : ''}${city}" in Northeast India.
Return ONLY a JSON array of strings. Do not invent distances or claim exact proximity when it is unknown. If reliable suggestions cannot be made, return an empty array.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });

      let parsed: unknown;
      try {
        parsed = JSON.parse(response.text || '[]');
      } catch {
        return res.status(502).json({ error: 'The attraction suggestion service returned invalid data. Please try again.' });
      }
      if (!Array.isArray(parsed)) {
        return res.status(502).json({ error: 'The attraction suggestion service returned an unexpected response.' });
      }
      const attractions = parsed
        .filter((item): item is string => typeof item === 'string')
        .map((item) => sanitizeInput(item, 120))
        .filter(Boolean)
        .slice(0, 4);

      res.json({ attractions, note: 'AI suggestions may be inaccurate. Please verify locations before publishing.' });
    } catch (error: any) {
      console.error('Error generating attractions:', error);
      res.status(500).json({ error: 'Failed to fetch attraction suggestions. Please try again later.' });
    }
  });

  // AI Helper 3: THIKANA AI Mitra Discovery & Travel Assistant Agent
  app.post('/api/ai/travel-assistant', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const query = sanitizeInput(body.query, 600);
      if (!query) return res.status(400).json({ error: 'Please enter a travel or stay search query.' });

      const rawCriteria = body.criteria && typeof body.criteria === 'object' && !Array.isArray(body.criteria)
        ? body.criteria
        : {};
      const safeNumber = (value: unknown, min: number, max: number) => {
        const number = Number(value);
        return Number.isFinite(number) && number >= min && number <= max ? number : undefined;
      };
      const validTripTypes = ['solo', 'couple', 'family', 'group', 'safari', 'trekking', 'peaceful', 'general'];
      const criteria = {
        destination: sanitizeInput(rawCriteria.destination, 100),
        state: sanitizeInput(rawCriteria.state, 80),
        guests: safeNumber(rawCriteria.guests, 1, 50),
        minBudget: safeNumber(rawCriteria.minBudget, 0, 10000000),
        maxBudget: safeNumber(rawCriteria.maxBudget, 0, 10000000),
        propertyType: sanitizeInput(rawCriteria.propertyType, 60),
        amenities: Array.isArray(rawCriteria.amenities)
          ? rawCriteria.amenities.slice(0, 10).map((item: unknown) => sanitizeInput(item, 50)).filter(Boolean)
          : [],
        nearAttraction: sanitizeInput(rawCriteria.nearAttraction, 100),
        checkIn: sanitizeInput(rawCriteria.checkIn, 20),
        checkOut: sanitizeInput(rawCriteria.checkOut, 20),
        tripType: validTripTypes.includes(rawCriteria.tripType) ? rawCriteria.tripType : 'general',
      };
      const conversationHistory = Array.isArray(body.conversationHistory)
        ? body.conversationHistory.slice(-6).filter((m: any) => m && typeof m === 'object').map((m: any) => ({
            role: m.sender === 'user' ? 'user' : 'model',
            text: sanitizeInput(m.text, 400),
          }))
        : [];

      // Never trust listing details supplied by a public browser. Accept only
      // document IDs, then load canonical, public-safe listing fields server-side.
      const candidateIds = Array.isArray(body.availableProperties)
        ? Array.from(new Set(body.availableProperties.slice(0, 6)
            .map((item: any) => sanitizeInput(typeof item === 'string' ? item : item?.id, 80))
            .filter(Boolean)))
        : [];
      let candidateProperties: Array<Record<string, unknown>> = [];
      if (candidateIds.length > 0) {
        try {
          const { db: adminDb } = await getFirebaseAdmin();
          const snapshots = await Promise.all(
            candidateIds.map((id: string) => adminDb.collection('properties').doc(id).get())
          );
          candidateProperties = snapshots
            .filter((snapshot: any) => snapshot.exists)
            .map((snapshot: any) => {
              const property = snapshot.data() || {};
              // Do not expose hidden/pending listings or private owner data to the model.
              if (property.status === 'blocked' || property.status === 'pending' || property.isHidden === true) return null;
              return {
                id: snapshot.id,
                title: sanitizeInput(property.title, 100),
                propertyType: sanitizeInput(property.propertyType || property.type, 50),
                city: sanitizeInput(property.city, 50),
                state: sanitizeInput(property.state, 50),
                startingPrice: safeNumber(property.startingPrice ?? property.price, 1, 10000000) ?? null,
                maxGuests: safeNumber(property.maxGuests ?? property.maxCapacity, 1, 100) ?? null,
                amenities: Array.isArray(property.amenities)
                  ? property.amenities.slice(0, 5).map((item: unknown) => sanitizeInput(item, 50)).filter(Boolean)
                  : [],
              };
            })
            .filter((item: Record<string, unknown> | null): item is Record<string, unknown> => item !== null);
        } catch (error: any) {
          console.error('AI Mitra canonical listing lookup failed:', error?.message || error);
          return res.status(503).json({ error: 'Stay listings could not be verified right now. Please try again shortly.' });
        }
      }

      const ai = getGenAI();

      const systemPrompt = `You are "THIKANA AI Mitra", the official Northeast Stay Discovery Assistant on THIKANA (a zero-commission direct-booking marketplace connecting travelers directly with homestays, Chang Ghar bamboo stays, eco cottages, and boutique resorts in Northeast India: Assam, Meghalaya, Arunachal Pradesh, Sikkim, Nagaland, Mizoram, Manipur, Tripura).

PERSONALITY & TONE:
- Friendly, simple, concise, helpful, trustworthy.
- Suitable for everyday mobile users.
- Multilingual: Support English, Hindi, and Hinglish naturally.
  * If user queries in Hindi or Hinglish, respond in warm, natural Hindi/Hinglish.
  * If user queries in English, respond in clear English.

CRITICAL TRUST & SAFETY RULES (ZERO HALLUCINATIONS):
1. You MUST ONLY recommend and discuss properties that actually exist in the provided THIKANA candidate listings list below.
2. NEVER invent fake hotels, prices, phone numbers, reviews, star ratings, or amenities.
3. If no properties in the list match the user's requested destination/criteria, clearly state:
   "I could not find an exact match in THIKANA right now. Here are the closest available options."
4. If the user's request is incomplete (e.g. missing guests or budget), ask ONLY the necessary question concisely without spamming.
5. In your response:
   - Provide a brief 1-2 paragraph helpful overview explaining why the recommended stay(s) match the user's destination, budget, guest count, or preferences (e.g. proximity to Kaziranga Safari Gate, Living Root bridges in Sohra, or Tawang Monastery views).
   - Remind the user that they can tap "Book / Contact Host on WhatsApp" to connect directly with the local host with zero commission.`;

      const userPrompt = `USER QUERY: "${query}"

CURRENT EXTRACTED REQUIREMENTS:
${JSON.stringify(criteria, null, 2)}

UNVERIFIED CANDIDATE LISTINGS SUPPLIED BY THE CLIENT:
${JSON.stringify(candidateProperties, null, 2)}

RECENT CHAT CONTEXT:
${JSON.stringify(conversationHistory, null, 2)}

Generate a helpful, friendly, and concise response addressing the user's query and explaining the matching THIKANA listings.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        config: {
          // Keep safety and grounding instructions separate from untrusted user data.
          systemInstruction: systemPrompt,
        },
        contents: userPrompt,
      });

      res.json({
        reply: response.text || 'Here are authentic Northeast stays on THIKANA matching your request!',
        modelUsed: 'gemini-3.7-flash'
      });
    } catch (error: any) {
      console.error('Error in travel assistant:', error);
      res.status(500).json({ error: 'Travel assistant is temporarily unavailable. Please try again later.' });
    }
  });

  // Vite middleware for development vs production static serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (process.env.VERCEL !== '1') {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`THIKANA Server running on http://localhost:${PORT}`);
    });
  }
  return app;
}

const appPromise = startServer();

// Vercel invokes this exported handler for /api/* requests. Local development
// continues to use the Express listener above.
export default async function handler(req: express.Request, res: express.Response) {
  const app = await appPromise;
  return app(req, res);
}
