import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Vitest configuration (separate from vite.config.ts on purpose).
 *
 * The Tailwind plugin is deliberately not loaded here: tests assert on DOM
 * structure and behaviour, not on generated CSS, and skipping it keeps the
 * suite fast. `@vitejs/plugin-react` is required for the JSX transform.
 *
 * Environment: jsdom globally (the app is a browser SPA). Files that need a
 * real Node environment — the Express server suite — override it with the
 * `// @vitest-environment node` docblock, the mechanism documented by Vitest
 * for per-file environments.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', '*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', 'e2e'],
    restoreMocks: true,
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}', 'server.ts'],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/test/**',
        'src/**/*.d.ts',
        'src/types/**',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
      ],
    },
  },
});
