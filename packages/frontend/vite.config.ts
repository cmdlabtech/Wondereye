import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

// Load .env.local for dev IP configuration
// process.env.VITE_DEV_IP takes precedence (allows script overrides), then .env.local, then localhost
const env = loadEnv('development', process.cwd());
const devHost = process.env.VITE_DEV_IP || env.VITE_DEV_IP || 'localhost';

export default defineConfig({
  root: '.',
  publicDir: 'public',
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
      },
    },
  },
});
