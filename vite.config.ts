import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
  }
});
