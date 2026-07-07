import { defineConfig, loadEnv, type Plugin, type ResolvedConfig } from 'vite';
import { resolve } from 'path';
import { rmSync } from 'fs';

// Load .env.local for dev IP configuration
// process.env.VITE_DEV_IP takes precedence (allows script overrides), then .env.local, then localhost
const env = loadEnv('development', process.cwd());
const devHost = process.env.VITE_DEV_IP || env.VITE_DEV_IP || 'localhost';

// Strip files that must never ship: internal docs (public/CLAUDE.md) always;
// in EHPK builds also _headers (a Cloudflare Pages file — useless in the .ehpk
// and its URLs trip the store's network-whitelist scanner).
function stripInternalFiles(isEhpk: boolean): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'strip-internal-files',
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      rmSync(resolve(outDir, 'CLAUDE.md'), { force: true });
      if (isEhpk) rmSync(resolve(outDir, '_headers'), { force: true });
    },
  };
}

export default defineConfig(({ mode }) => {
  // EHPK builds (glasses app bundle) exclude the phone-web-only pages:
  // index.html (homepage, replaced by app.html during pack) and map.html
  // (Leaflet — its tile/attribution URLs are not network-whitelisted).
  const isEhpk = mode === 'ehpk';
  const input: Record<string, string> = isEhpk
    ? {
        app: resolve(__dirname, 'app.html'),
      }
    : {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'),
        map: resolve(__dirname, 'map.html'),
      };

  return {
    root: '.',
    publicDir: 'public',
    plugins: [stripInternalFiles(isEhpk)],
    server: {
      host: devHost,
      port: 5173,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: { input },
    },
  };
});
