// The build script creates dist/server.cjs before Vercel packages API functions.
import serverModule from '../dist/server.cjs';

const serverHandler = (serverModule as any).default || serverModule;

export default serverHandler;
