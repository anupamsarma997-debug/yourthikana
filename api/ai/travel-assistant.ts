// @ts-expect-error The Vercel build creates this bundled CommonJS file before packaging API functions.
import serverModule from '../../dist/server.cjs';

// The build script bundles the Express app to dist/server.cjs before Vercel
// packages API functions. Export its Express default for the Node function.
const app = (serverModule as any).default ?? (serverModule as any).app ?? serverModule;
export default app;
