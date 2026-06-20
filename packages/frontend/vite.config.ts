import { defineConfig, loadEnv, type Plugin } from 'vite';
import { resolve } from 'path';
import { rmSync } from 'fs';

// Load .env.local for dev IP configuration
// process.env.VITE_DEV_IP takes precedence (allows script overrides), then .env.local, then localhost
const env = loadEnv('development', process.cwd());
const devHost = process.env.VITE_DEV_IP || env.VITE_DEV_IP || 'localhost';

// Strip internal docs (e.g. a directory-level CLAUDE.md) that live in public/ from
// the build output so they never ship in the .ehpk or to the live site.
function stripInternalDocs(): Plugin {
  return {
    name: 'strip-internal-docs',
    closeBundle() {
      rmSync(resolve(__dirname, 'dist/CLAUDE.md'), { force: true });
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [stripInternalDocs()],
  server: {
    host: devHost,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'),
        settings: resolve(__dirname, 'settings.html'),
        map: resolve(__dirname, 'map.html'),
      },
    },
  },
});
