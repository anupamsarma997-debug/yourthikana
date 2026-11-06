import type { VercelRequest, VercelResponse } from '@vercel/node';

// Lightweight liveness endpoint. Keep this independent from the Express bundle
// so a server-bundle initialization problem cannot make the health probe fail.
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.status(200).json({
    status: 'ok',
    app: 'THIKANA Marketplace',
    probe: 'liveness',
    time: new Date().toISOString(),
  });
}
