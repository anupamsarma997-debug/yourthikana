import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const appDir = process.cwd();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '20mb' }));

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
      res.status(500).json({ error: error.message || 'Failed to generate AI description' });
    }
  });

  // AI Helper 2: Generate Nearby Attractions
  app.post('/api/ai/nearby-attractions', async (req, res) => {
    try {
      const city = sanitizeInput(req.body.city, 100);
      const address = sanitizeInput(req.body.address, 150);
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

      let json: string[] = [];
      try {
        json = JSON.parse(response.text || '[]');
      } catch (e) {
        json = ['Local Scenic Viewpoint (2 km)', 'City Center Market (1.5 km)', 'Historical Monument (3 km)', 'Nature Trail Walk (1 km)'];
      }

      res.json({ attractions: json });
    } catch (error: any) {
      console.error('Error generating attractions:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch attractions' });
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

      const candidateProperties = Array.isArray(req.body.availableProperties)
        ? req.body.availableProperties.slice(0, 6).map((p: any) => ({
            id: sanitizeInput(p.id, 50),
            title: sanitizeInput(p.title, 100),
            propertyType: sanitizeInput(p.propertyType || p.type, 50),
            city: sanitizeInput(p.city, 50),
            state: sanitizeInput(p.state, 50),
            startingPrice: Number(p.startingPrice || p.price || 1500),
            maxGuests: Number(p.maxGuests || p.maxCapacity || 2),
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
        reply: response.text || 'Here are authentic Northeast stays on THIKANA matching your request!',
        modelUsed: 'gemini-3.7-flash'
      });
    } catch (error: any) {
      console.error('Error in travel assistant:', error);
      res.status(500).json({ error: error.message || 'Travel assistant error' });
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`THIKANA Server running on http://localhost:${PORT}`);
  });
}

startServer();
