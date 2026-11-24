import express from 'express';
import { createSign } from 'node:crypto';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

export const app = express();

async function configureServer() {
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

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

  // Health API
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', app: 'THIKANA Marketplace', time: new Date().toISOString() });
  });

  // Daily subscription expiry maintenance. The route is private to Vercel Cron
  // and uses the existing Firebase service-account secret; no client token or
  // owner-editable role can trigger privileged Firestore writes.
  app.get('/api/cron/expire-subscriptions', async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return res.status(503).json({ error: 'Subscription maintenance is not configured.' });
    }
    if (req.headers.authorization !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    const serviceAccountValue = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountValue) {
      return res.status(503).json({ error: 'Firebase service account is not configured.' });
    }

    try {
      const serviceAccount = JSON.parse(serviceAccountValue) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
        token_uri?: string;
      };
      if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
        return res.status(503).json({ error: 'Firebase service account credentials are incomplete.' });
      }

      const issuedAt = Math.floor(Date.now() / 1000);
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const unsignedToken = [
        encode({ alg: 'RS256', typ: 'JWT' }),
        encode({
          iss: serviceAccount.client_email,
          scope: 'https://www.googleapis.com/auth/datastore',
          aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
          iat: issuedAt,
          exp: issuedAt + 3600,
        }),
      ].join('.');
      const signer = createSign('RSA-SHA256');
      signer.update(unsignedToken);
      signer.end();
      const assertion = `${unsignedToken}.${signer.sign(serviceAccount.private_key, 'base64url')}`;

      const tokenResponse = await fetch(serviceAccount.token_uri || 'https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }),
      });
      if (!tokenResponse.ok) {
        throw new Error(`Google OAuth token request failed with HTTP ${tokenResponse.status}.`);
      }
      const tokenPayload = await tokenResponse.json() as { access_token?: string };
      if (!tokenPayload.access_token) throw new Error('Google OAuth did not return an access token.');

      const queryUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.project_id)}/databases/(default)/documents:runQuery`;
      const queryResponse = await fetch(queryUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenPayload.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'properties' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'status' },
                op: 'EQUAL',
                value: { stringValue: 'active' },
              },
            },
          },
        }),
      });
      if (!queryResponse.ok) {
        throw new Error(`Firestore property query failed with HTTP ${queryResponse.status}.`);
      }

      const rows = await queryResponse.json() as Array<{ document?: { name?: string; updateTime?: string; fields?: Record<string, any> } }>;
      const now = new Date();
      let scanned = 0;
      let expired = 0;
      let skippedWithoutExpiry = 0;
      let concurrentChanges = 0;

      for (const row of rows) {
        const document = row.document;
        if (!document?.name || !document.updateTime || !document.fields) continue;
        scanned += 1;
        const fields = document.fields;
        const expiryValues = [
          fields.subscriptionExpiresAtTimestamp?.timestampValue,
          fields.subscriptionExpiresAt?.stringValue,
          fields.subscriptionExpiryDate?.stringValue,
          fields.subscriptionTrialEndsAtTimestamp?.timestampValue,
          fields.subscriptionTrialEndsAt?.stringValue,
        ];
        let expiryMillis: number | null = null;
        for (const value of expiryValues) {
          if (typeof value !== 'string' || !value.trim()) continue;
          const parsed = Date.parse(value);
          if (Number.isFinite(parsed)) { expiryMillis = parsed; break; }
        }
        if (expiryMillis === null) {
          skippedWithoutExpiry += 1;
          continue;
        }
        if (expiryMillis > now.getTime()) continue;

        const patchUrl = new URL(`https://firestore.googleapis.com/v1/${document.name}`);
        patchUrl.searchParams.append('updateMask.fieldPaths', 'status');
        patchUrl.searchParams.append('updateMask.fieldPaths', 'subscriptionStatus');
        patchUrl.searchParams.append('updateMask.fieldPaths', 'subscriptionExpiredAt');
        patchUrl.searchParams.set('currentDocument.updateTime', document.updateTime);
        const patchResponse = await fetch(patchUrl, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${tokenPayload.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: document.name,
            fields: {
              status: { stringValue: 'hidden_expired' },
              subscriptionStatus: { stringValue: 'expired' },
              subscriptionExpiredAt: { timestampValue: now.toISOString() },
            },
          }),
        });
        if (!patchResponse.ok) {
          const failure = await patchResponse.json().catch(() => ({})) as { error?: { status?: string } };
          if (patchResponse.status === 409 || failure.error?.status === 'FAILED_PRECONDITION') {
            concurrentChanges += 1;
            continue;
          }
          throw new Error(`Could not expire property ${document.name.split('/').pop()} (HTTP ${patchResponse.status}).`);
        }
        expired += 1;
      }

      return res.json({ success: true, scanned, expired, skippedWithoutExpiry, concurrentChanges, checkedAt: now.toISOString() });
    } catch (error: any) {
      console.error('Subscription expiry maintenance failed:', error?.message || error);
      return res.status(500).json({ error: 'Subscription expiry maintenance failed. Check server logs.' });
    }
  });

  // Protect paid Gemini-backed endpoints with Firebase ID-token verification.
  // Firebase Identity Toolkit validates token signature, expiry, and project membership.
  const aiRequestCounts = new Map<string, { count: number; resetAt: number }>();
  app.use('/api/ai', async (req, res, next) => {
    const authorization = req.headers.authorization || '';
    const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const firebaseApiKey = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY;

    if (!idToken || !firebaseApiKey) {
      return res.status(401).json({ error: 'Sign in is required to use this service.' });
    }

    try {
      const verifyResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        }
      );
      if (!verifyResponse.ok) {
        return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });
      }

      const verified = await verifyResponse.json() as { users?: Array<{ localId?: string; emailVerified?: boolean }> };
      const uid = verified.users?.[0]?.localId;
      if (!uid) {
        return res.status(401).json({ error: 'Your session could not be verified. Please sign in again.' });
      }

      const now = Date.now();
      const current = aiRequestCounts.get(uid);
      if (!current || current.resetAt <= now) {
        aiRequestCounts.set(uid, { count: 1, resetAt: now + 60_000 });
      } else if (current.count >= 20) {
        res.setHeader('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
        return res.status(429).json({ error: 'Too many AI requests. Please wait one minute and try again.' });
      } else {
        current.count += 1;
      }

      return next();
    } catch {
      return res.status(503).json({ error: 'Sign-in verification is temporarily unavailable. Please try again.' });
    }
  });

  // Input Sanitizer Helper to prevent Prompt Injection & excessive payload sizes
  const sanitizeInput = (val: any, maxLen = 500): string => {
    if (typeof val !== 'string') return '';
    // Strip system control characters and limit length
    return val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim().slice(0, maxLen);
  };



  // AI Helper 1: Generate Listing Description (Zero Hallucinations, strictly grounded in owner factual data)
  app.post('/api/ai/generate-description', async (req, res) => {
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
      res.status(500).json({ error: 'Failed to generate AI description. Please try again.' });
    }
  });

  // AI Helper 2: Generate Nearby Attractions
  app.post('/api/ai/nearby-attractions', async (req, res) => {
    try {
      const city = sanitizeInput(req.body.city, 100);
      const address = sanitizeInput(req.body.address, 150);
      if (!city && !address) return res.status(400).json({ error: 'A city or address is required.' });
      const ai = getGenAI();

      const prompt = `List 4 real tourist attractions, waterfalls, national parks, tea gardens, or monasteries near "${address}, ${city}" in Northeast India.
Return ONLY a raw JSON array of 4 strings with approximate distances, for example: ["Kaziranga Safari Gate (2 km)", "Orchid & Biodiversity Park (1.5 km)", "Kakochang Waterfall (14 km)", "Brahmaputra Sunset Viewpoint (8 km)"]`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      });

      let json: unknown;
      try {
        json = JSON.parse(response.text || 'null');
      } catch {
        // Never replace an invalid AI response with invented places or distances.
        return res.status(502).json({
          attractions: [],
          unavailable: true,
          message: 'Nearby attractions could not be verified. Please check with the property host.',
        });
      }

      if (!Array.isArray(json) || json.some((item) => typeof item !== 'string' || !item.trim())) {
        return res.status(502).json({
          attractions: [],
          unavailable: true,
          message: 'Nearby attractions could not be verified. Please check with the property host.',
        });
      }

      res.json({ attractions: json });
    } catch (error: any) {
      console.error('Error generating attractions:', error);
      res.status(500).json({ error: 'Failed to fetch nearby attractions. Please try again.' });
    }
  });

  // AI Helper 3: THIKANA AI Mitra Discovery & Travel Assistant Agent
  app.post('/api/ai/travel-assistant', async (req, res) => {
    try {
      const query = sanitizeInput(req.body.query, 600);
      const criteria = req.body.criteria || {};
      const conversationHistory = Array.isArray(req.body.conversationHistory)
        ? req.body.conversationHistory.slice(-6).map((m: any) => ({
            role: m.sender === 'user' ? 'user' : 'model',
            text: sanitizeInput(m.text, 400),
          }))
        : [];

      const toPositiveNumberOrNull = (value: unknown): number | null => {
        if (value === null || value === undefined || value === '') return null;
        const parsed = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      };

      const candidateProperties = Array.isArray(req.body.availableProperties)
        ? req.body.availableProperties.slice(0, 6).map((p: any) => ({
            id: sanitizeInput(p.id, 50),
            title: sanitizeInput(p.title, 100),
            propertyType: sanitizeInput(p.propertyType || p.type, 50),
            city: sanitizeInput(p.city, 50),
            state: sanitizeInput(p.state, 50),
            startingPrice: toPositiveNumberOrNull(p.startingPrice ?? p.price),
            maxGuests: toPositiveNumberOrNull(p.maxGuests ?? p.maxCapacity),
            amenities: Array.isArray(p.amenities) ? p.amenities.slice(0, 5) : [],
            distanceNote: sanitizeInput(p.distanceNote || '', 100),
            matchReason: sanitizeInput(p.matchReason || '', 150),
            isVerified: Boolean(p.isVerified || p.verified),
            ownerName: sanitizeInput(p.ownerName || '', 50),
            ownerWhatsApp: sanitizeInput(p.ownerWhatsApp || '', 20),
          }))
        : [];

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
2. NEVER invent fake hotels, prices, phone numbers, reviews, star ratings, amenities, guest capacities, or distances.
3. A candidate's startingPrice or maxGuests may be null when the owner did not provide that value. Treat null as unknown: do not estimate, substitute, or infer a value. Tell the user to confirm the missing detail directly with the host.
4. If no properties in the list match the user's requested destination/criteria, clearly state:
   "I could not find an exact match in THIKANA right now. Here are the closest available options."
5. If the user's request is incomplete (e.g. missing guests or budget), ask ONLY the necessary question concisely without spamming.
6. In your response:
   - Provide a brief 1-2 paragraph helpful overview explaining why the recommended stay(s) match the user's destination, budget, guest count, or preferences (e.g. proximity to Kaziranga Safari Gate, Living Root bridges in Sohra, or Tawang Monastery views).
   - Remind the user that they can tap "Book / Contact Host on WhatsApp" to connect directly with the local host with zero commission.`;

      const userPrompt = `USER QUERY: "${query}"

CURRENT EXTRACTED REQUIREMENTS:
${JSON.stringify(criteria, null, 2)}

REAL THIKANA CANDIDATE LISTINGS IN DATABASE:
${JSON.stringify(candidateProperties, null, 2)}

RECENT CHAT CONTEXT:
${JSON.stringify(conversationHistory, null, 2)}

Generate a helpful, friendly, and concise response addressing the user's query and explaining the matching THIKANA listings.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { text: systemPrompt },
              { text: userPrompt }
            ]
          }
        ],
      });

      res.json({
        reply: response.text || 'I could not prepare a verified recommendation right now. Please try again or contact a property host directly.',
        modelUsed: 'gemini-3.7-flash'
      });
    } catch (error: any) {
      console.error('Error in travel assistant:', error);
      res.status(500).json({ error: 'Travel assistant is temporarily unavailable. Please try again.' });
    }
  });

  // Vercel serves the static Vite build separately and invokes this Express
  // app only for /api/* requests. Do not start a long-running listener in a
  // serverless function.
  if (process.env.VERCEL !== '1') {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
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

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`THIKANA Server running on http://localhost:${PORT}`);
    });
  }
}

void configureServer();
export default app;
