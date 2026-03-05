import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

// Load .env.local for dev IP configuration
const env = loadEnv('development', process.cwd());
const devHost = env.VITE_DEV_IP || '192.168.86.100';

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
