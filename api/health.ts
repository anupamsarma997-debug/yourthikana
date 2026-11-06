import serverHandler from '../server.ts';
import type { Request, Response } from 'express';

// Dedicated health route using the same bundled serverless handler as the API catch-all.
export default function handler(req: Request, res: Response) {
  return serverHandler(req, res);
}
