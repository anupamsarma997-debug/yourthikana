import type { Request, Response } from 'express';

// Lightweight platform liveness probe. This intentionally does not import the
// Express application, so Vercel's function runtime can be tested independently.
export default function handler(_req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    status: 'ok',
    service: 'YourThikana API function',
    runtime: 'vercel-serverless',
  });
}
