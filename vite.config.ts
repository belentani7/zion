import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Extract the package name from an absolute module id so vendor code can be
 * grouped into stable, independently cacheable chunks. Handles scoped packages
 * (@scope/name) and nested node_modules (pnpm/bun style layouts).
 */
function packageNameOf(id: string): string | null {
  const marker = 'node_modules/';
  const index = id.lastIndexOf(marker);
  if (index === -1) return null;
  const parts = id.slice(index + marker.length).split('/');
  if (parts[0].startsWith('@')) return `${parts[0]}/${parts[1] ?? ''}`;
  return parts[0];
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    // Vite 6 types this as `string[] | true`. The previous value `'all'` was a
    // string, so `isHostAllowed()` iterated its characters ('a','l','l') and
    // never matched: every non-localhost Host header got a 403
    // "Blocked request. This host (...) is not allowed." — which broke reverse
    // proxies, tunnels and LAN access. `true` disables the host check.
    allowedHosts: true
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true
  },
  build: {
    // Same target as tsconfig.json ("target": "ES2022"): no down-levelling of
    // syntax the browsers that support WebGL2 already implement.
    target: 'es2022',
    cssMinify: 'esbuild',
    reportCompressedSize: true,
    // Three.js alone is ~500 kB minified; a 500 kB warning on every build is
    // noise once the real budgets live in scripts/perf-report.mjs.
    chunkSizeWarningLimit: 620,
    rollupOptions: {
      output: {
        /**
         * Without this, Rollup emitted one chunk per lazily imported lucide icon
         * (8 extra HTTP requests) and named the Three.js bundle after an
         * unrelated shared module. Explicit groups give predictable names and
         * long-term caching: a change in app code no longer invalidates the
         * Three.js or React chunks.
         */
        manualChunks(id: string) {
          const pkg = packageNameOf(id);
          if (!pkg) return undefined;
          if (pkg === 'three') return 'vendor-three';
          if (pkg === 'lucide-react') return 'vendor-icons';
          if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler') return 'vendor-react';
          return 'vendor';
        }
      }
    }
  }
});
