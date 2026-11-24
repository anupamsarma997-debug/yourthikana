// @ts-ignore Generated CommonJS bundle is present in Vercel builds; CI creates it after type-check.
import serverModule from '../dist/server.cjs';

// The build script bundles the Express app to dist/server.cjs before Vercel
// packages API functions. Export its Express default for the Node function.
const app = (serverModule as any).default ?? (serverModule as any).app ?? serverModule;
export default app;
