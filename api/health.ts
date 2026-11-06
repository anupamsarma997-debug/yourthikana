// The build script creates dist/server.cjs before Vercel packages API functions.
// @ts-expect-error Generated build artifact; resolved by Vercel after the build step.
import serverModule from '../dist/server.cjs';

const serverHandler = (serverModule as any).default || serverModule;

export default serverHandler;
