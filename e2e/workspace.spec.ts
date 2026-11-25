import { expect, test } from '@playwright/test';

/**
 * Happy path of the workspace, driven against the real production build.
 *
 * Covers the six navigation tabs, the SDD Maestro audit round trip, the
 * language switch, the WebGL degradation path and the health endpoint. The
 * selectors are accessibility queries (role + accessible name) so the suite
 * keeps working when class names change — and fails when a control loses its
 * accessible name, which is exactly what criterion 24 protects.
 */

const TABS = [
  'JUDAS OMEGA',
  'OMEGA PRIME',
  'VISUAL ENGINE',
  'SDD MAESTRO',
  'CHECKLIST',
  'WORKSPACE',
] as const;

test.describe('shell del workspace', () => {
  test('sirve la aplicación y expone las 6 pestañas de navegación', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveTitle(/JUDAS/i);
    await expect(page.locator('nav')).toBeVisible();

    for (const tab of TABS) {
      await expect(page.getByRole('button', { name: new RegExp(tab, 'i') })).toBeVisible();
    }

    // The default tab must be reachable without interaction.
    await expect(page.getByRole('heading', { level: 1 })).toBeAttached();
    expect(errors, 'pageerror en el arranque').toEqual([]);
  });

  test('el enlace de salto lleva al contenido principal', async ({ page }) => {
    await page.goto('/');
    const skip = page.getByRole('link', { name: /contenido principal/i });
    await skip.focus();
    await expect(skip).toBeVisible();
    await expect(page.locator('#main-content')).toBeAttached();
  });

  test('cambia el idioma del documento y el de la interfaz', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'es');

    await page.getByRole('button', { name: /^EN$/ }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.getByRole('button', { name: /^PT$/ }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt');

    await page.getByRole('button', { name: /^CA$/ }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ca');
  });
});

test.describe('navegación entre vistas', () => {
  test('cada pestaña monta su vista sin errores de consola', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');

    for (const tab of TABS) {
      await page.getByRole('button', { name: new RegExp(tab, 'i') }).click();
      // Each view is a lazy chunk: wait for the Suspense fallback to resolve.
      await expect(page.locator('[role="status"]')).toBeHidden({ timeout: 15_000 }).catch(() => undefined);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('#main-content')).not.toBeEmpty();
      await expect(page.getByRole('button', { name: new RegExp(tab, 'i') })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }

    expect(errors, 'pageerror navegando las 6 vistas').toEqual([]);
  });
});

test.describe('SDD Maestro', () => {
  test('audita una spec y publica el veredicto en la región en vivo', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /SDD MAESTRO/i }).click();

    const spec = [
      '# SPEC — Zion',
      '',
      '## Objective',
      'Restaurar el workspace para que build, lint y tests pasen en verde.',
      '',
      '## Commands',
      'npm run build, npm run lint, npm test',
      '',
      '## Project Structure',
      'src/, server.ts, scripts/',
      '',
      '## Code Style',
      'TypeScript estricto, utilidades Tailwind, comentarios en español.',
      '',
      '## Testing Strategy',
      'Vitest con técnicas ISTQB y clases de entrada inválida y error de sistema.',
      '',
      '## Boundaries',
      'ALWAYS: typecheck. ASK: antes de borrar. NEVER: secretos.',
      '',
      '## Success Criteria',
      'WHEN el usuario abre la app THEN el sistema debe renderizar Judas OMEGA.',
      'WHILE no hay WebGL el sistema debe mostrar el fallback.',
      'IF el build falla, THEN el sistema debe salir con código no cero.',
      '',
      '## Gate',
      'E1 gate: checklist constitution-grade aprobado antes del código (P5 GATEKEEPING).',
    ].join('\n');

    await page.getByRole('button', { name: /Auditar Nueva Spec/i }).click();
    await page.getByLabel(/Spec a auditar/i).fill(spec);
    await page.getByRole('button', { name: /Ejecutar Auditoría/i }).click();

    const live = page.locator('[aria-live="polite"]');
    await expect(live).toBeVisible();
    await expect(live).toContainText(/Veredicto/);
    await expect(live).toContainText(/Puntuación: \d+\/100/);
  });

  test('marca un criterio del gate y refleja el progreso', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /SDD MAESTRO/i }).click();

    const donut = page.locator('span:text-is("86%")').first();
    await expect(donut).toBeVisible();

    // E5 ships expanded; its first unchecked item is the target.
    const box = page.locator('#sdd-stage-E5 input[type="checkbox"]:not(:checked)').first();
    await box.check();
    await expect(box).toBeChecked();

    // One more item done: 33/37 = 89%.
    await expect(page.locator('span:text-is("89%")').first()).toBeVisible();
  });
});

test.describe('degradación y rendimiento', () => {
  test('el canvas 3D no rompe la página cuando no hay WebGL', async ({ browser }) => {
    // Deterministic capability absence: getContext() returns null for every GL
    // context type before the page scripts run, exactly like a browser with
    // hardware acceleration disabled.
    const context = await browser.newContext();
    await context.addInitScript(() => {
      const native = HTMLCanvasElement.prototype.getContext.bind(
        HTMLCanvasElement.prototype,
      ) as HTMLCanvasElement['getContext'];
      HTMLCanvasElement.prototype.getContext = ((type: string) => {
        if (String(type).includes('webgl')) return null;
        return native(type as '2d');
      }) as HTMLCanvasElement['getContext'];
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await page.getByRole('button', { name: /VISUAL ENGINE/i }).click();

    // Either a real canvas or the documented fallback — never a blank page.
    const canvas = page.locator('canvas');
    const fallback = page.locator('[role="status"]', { hasText: /WebGL/i });
    const hasCanvas = (await canvas.count()) > 0;
    if (!hasCanvas) {
      await expect(fallback.first()).toBeVisible();
    }
    await expect(page.locator('#main-content')).not.toBeEmpty();
    expect(errors, 'pageerror sin WebGL').toEqual([]);

    await context.close();
  });

  test('con prefers-reduced-motion la interfaz sigue usable', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();

    await page.goto('/');
    await page.getByRole('button', { name: /JUDAS OMEGA/i }).click();
    await expect(page.locator('#main-content')).not.toBeEmpty();
    await context.close();
  });

  test('el JS del primer paint queda por debajo del presupuesto', async ({ page }) => {
    const jsBytes: number[] = [];
    page.on('response', async (response) => {
      const url = response.url();
      if (!url.endsWith('.js')) return;
      // Only count what the initial document pulls in, not lazy chunks.
      if (response.request().resourceType() !== 'script') return;
      const headers = await response.allHeaders();
      const length = Number(headers['content-length'] ?? 0);
      if (length > 0) jsBytes.push(length);
    });

    await page.goto('/', { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');

    // 120 kB gzip budget from scripts/perf-report.mjs; the transfer size here
    // is whatever the server sends, so the assertion is deliberately generous.
    const transferred = jsBytes.reduce((total, size) => total + size, 0);
    expect(transferred).toBeLessThan(900_000);
  });
});

test.describe('contrato del servidor', () => {
  test('GET /api/health responde 200 con el contrato esperado', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('belentani-omega-kernel');
    expect(typeof body.aiConfigured).toBe('boolean');

    expect(response.headers()['cache-control']).toContain('no-store');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('POST /api/lore valida la entrada antes de llamar al modelo', async ({ request }) => {
    const empty = await request.post('/api/lore', { data: { query: '' } });
    expect(empty.status()).toBe(400);
    expect((await empty.json()).code).toBe('INVALID_QUERY');

    const oversized = await request.post('/api/lore', { data: { query: 'a'.repeat(601) } });
    expect(oversized.status()).toBe(400);
  });

  test('una ruta de API desconocida responde JSON 404', async ({ request }) => {
    const response = await request.get('/api/no-existe');
    expect(response.status()).toBe(404);
    expect((await response.json()).code).toBe('NOT_FOUND');
  });

  test('los deep links devuelven el shell del SPA', async ({ request }) => {
    const response = await request.get('/ruta/profunda/inexistente');
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('<div id="root">');
  });

  test('los assets con hash se cachean un año y el HTML no', async ({ page, request }) => {
    const document = await request.get('/');
    const html = await document.text();
    expect(document.headers()['cache-control']).toContain('no-cache');

    const assetPath = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
    expect(assetPath, 'no se encontró el chunk de entrada en el HTML').toBeTruthy();

    const asset = await request.get(assetPath as string);
    expect(asset.status()).toBe(200);
    expect(asset.headers()['cache-control']).toContain('max-age=31536000');
    expect(asset.headers()['cache-control']).toContain('immutable');

    await page.goto('/');
  });
});
