import type { Request, Response } from 'express';

// Diagnostic health route: lazy-load the shared Express app so startup errors
// are returned as a safe JSON response instead of Vercel's generic invocation failure.
export default async function handler(req: Request, res: Response) {
  try {
    const { default: serverHandler } = await import('../server.ts');
    return await serverHandler(req, res);
  } catch (error: any) {
    console.error('Health route could not initialize server:', error?.stack || error?.message || error);
    return res.status(503).json({
      status: 'unavailable',
      code: error?.code || 'SERVER_INITIALIZATION_FAILED',
      message: typeof error?.message === 'string'
        ? error.message.slice(0, 180)
        : 'Server initialization failed',
    });
  }
}
