import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration.
 *
 * The suite drives the real production build through the Express server
 * (`npm run build && node server.ts`), so it validates what ships: static
 * assets, cache headers, SPA fallback and the /api/health contract.
 *
 * `webServer.reuseExistingServer` lets a developer point the suite at an
 * already-running `npm run dev`; CI always starts a clean one.
 *
 * Browsers must be installed once (`npx playwright install --with-deps
 * chromium`); the sandbox where this repo was restored has no network route to
 * the Playwright CDN, which is why the suite ships runnable but was not
 * executed there — see RIESGOS in the delivery report.
 */
const PORT = Number(process.env.E2E_PORT || 4173);
const BASE_URL = process.env.E2E_BASE_URL || `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // The workspace is a WebGL showcase: keep software rendering deterministic.
    launchOptions: {
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && PORT=${PORT} NODE_ENV=production node server.ts`,
        url: `${BASE_URL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { NODE_ENV: 'production', PORT: String(PORT) },
      },
});
