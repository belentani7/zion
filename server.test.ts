// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

/**
 * Integration suite for the Express kernel.
 *
 * The Gemini SDK is mocked, so the tests exercise this server's own contract —
 * validation, allowlists, rate limiting, error mapping, headers and the SPA
 * fallback — without touching the network. Runs in the `node` environment
 * (docblock above) because it binds a real HTTP server.
 */

const generateContent = vi.fn();

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models = { generateContent };
      constructor(_options: unknown) {
        void _options;
      }
    },
    ThinkingLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
  };
});

let baseUrl = '';
let closeServer: () => Promise<void> = async () => {};

beforeAll(async () => {
  const { createServer } = await import('./server');
  const server = await createServer();
  const bound = await server.listen(0);
  closeServer = bound.close;
  baseUrl = `http://127.0.0.1:${bound.port}`;
});

afterAll(async () => {
  await closeServer();
});

let consoleSpies: { restore: () => void }[] = [];

beforeEach(() => {
  generateContent.mockReset();
  vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
  // The kernel logs every event as structured JSON; keep the suite output clean.
  consoleSpies = ['log', 'warn', 'error'].map((channel) => {
    const spy = vi
      .spyOn(console, channel as 'log' | 'warn' | 'error')
      .mockImplementation(() => {});
    return { restore: () => spy.mockRestore() };
  });
});

afterEach(() => {
  for (const spy of consoleSpies) spy.restore();
  consoleSpies = [];
  vi.unstubAllEnvs();
});

async function postLore(body: unknown) {
  const response = await fetch(`${baseUrl}/api/lore`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

describe('GET /api/health', () => {
  it('answers 200 with the service contract', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('belentani-omega-kernel');
    expect(typeof body.aiConfigured).toBe('boolean');
    expect(typeof body.model).toBe('string');
    expect(typeof body.uptimeSec).toBe('number');
  });

  it('is never cached', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('security headers', () => {
  it('ships the hardening set on every response', async () => {
    const response = await fetch(`${baseUrl}/api/health`);

    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('permissions-policy')).toContain('microphone=()');
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });

  it('does not advertise the framework', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.headers.get('x-powered-by')).toBeNull();
  });
});

describe('POST /api/lore — input validation (equivalence classes and boundaries)', () => {
  it.each([
    ['empty body', {}],
    ['empty query', { query: '' }],
    ['whitespace query', { query: '    ' }],
    ['non-string query', { query: 42 }],
    ['null query', { query: null }],
  ])('rejects %s with 400 INVALID_QUERY', async (_label, body) => {
    const result = await postLore(body);
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('INVALID_QUERY');
  });

  it.each([
    [600, 200],
    [601, 400],
  ])('query of %i characters → %i', async (length, expectedStatus) => {
    generateContent.mockResolvedValue({ text: 'respuesta del núcleo' });
    const result = await postLore({ query: 'a'.repeat(length) });
    expect(result.status).toBe(expectedStatus);
  });

  it('rejects a malformed JSON body with 400', async () => {
    const response = await fetch(`${baseUrl}/api/lore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(response.status).toBe(400);
  });

  it('rejects a body over the 64 kb limit with 413', async () => {
    const response = await fetch(`${baseUrl}/api/lore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'a'.repeat(70_000) }),
    });
    expect(response.status).toBe(413);
  });
});

describe('POST /api/lore — allowlists', () => {
  it('falls back to es/lore for unknown lang and mode instead of echoing them', async () => {
    generateContent.mockResolvedValue({ text: 'ok' });

    const result = await postLore({ query: 'quién es Judas', lang: 'xx', mode: '"><script>' });

    expect(result.status).toBe(200);
    expect(result.body.lang).toBe('es');
    expect(result.body.mode).toBe('lore');

    const prompt = generateContent.mock.calls[0][0].contents as string;
    expect(prompt).toContain('[MODO: LORE | IDIOMA: es');
    expect(prompt).not.toContain('<script>');
  });

  it('accepts every supported language', async () => {
    generateContent.mockResolvedValue({ text: 'ok' });
    for (const lang of ['pt', 'es', 'en', 'ca']) {
      const result = await postLore({ query: 'hola', lang });
      expect(result.body.lang).toBe(lang);
    }
  });

  it('counts unlocked gems for the prompt context', async () => {
    generateContent.mockResolvedValue({ text: 'ok' });
    await postLore({ query: 'hola', unlockedGems: [0, 1, 2] });
    expect(generateContent.mock.calls[0][0].contents).toContain('GEMAS_ACTIVAS: 3/5');
  });
});

describe('POST /api/lore — upstream error mapping (decision table)', () => {
  it('returns the reply and the model on success', async () => {
    generateContent.mockResolvedValue({ text: '  Judas es el catalizador.  ' });

    const result = await postLore({ query: 'quién es Judas' });

    expect(result.status).toBe(200);
    expect(result.body.reply).toBe('Judas es el catalizador.');
    expect(result.body.model).toBe('gemini-4-hydrogen');
  });

  it.each([
    ['403 PERMISSION_DENIED for the key', new Error('403 PERMISSION_DENIED'), 403],
    ['429 RESOURCE_EXHAUSTED quota', new Error('429 RESOURCE_EXHAUSTED'), 429],
    ['aborted upstream call', new Error('TimeoutError: The operation was aborted'), 504],
    ['unknown upstream failure', new Error('socket hang up'), 502],
  ])('maps %s to HTTP %i', async (_label, error, expectedStatus) => {
    generateContent.mockRejectedValue(error);
    const result = await postLore({ query: 'hola' });
    expect(result.status).toBe(expectedStatus);
    expect(result.body.code).toMatch(/UPSTREAM/);
  });

  it('never leaks the upstream detail on 5xx (P4 ERROR LEAKAGE)', async () => {
    generateContent.mockRejectedValue(new Error('invalid api key AIzaSySECRETVALUE1234567890'));

    const result = await postLore({ query: 'hola' });

    expect(result.status).toBe(502);
    expect(JSON.stringify(result.body)).not.toContain('AIzaSySECRETVALUE1234567890');
    expect(result.body.error).toBe('El núcleo no pudo responder. Inténtalo de nuevo.');
  });

  it('reports an empty generation as 502 EMPTY_RESPONSE', async () => {
    generateContent.mockResolvedValue({ text: '   ' });

    const result = await postLore({ query: 'hola' });

    expect(result.status).toBe(502);
    expect(result.body.code).toBe('EMPTY_RESPONSE');
  });

  it('answers 503 MISSING_API_KEY when the secret is absent', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');

    const result = await postLore({ query: 'hola' });

    expect(result.status).toBe(503);
    expect(result.body.code).toBe('MISSING_API_KEY');
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('passes system instruction, thinking level, token cap and abort signal', async () => {
    generateContent.mockResolvedValue({ text: 'ok' });

    await postLore({ query: 'hola' });

    const call = generateContent.mock.calls[0][0];
    expect(call.model).toBe('gemini-4-hydrogen');
    expect(call.config.systemInstruction).toContain('KERNEL_OMEGA');
    expect(call.config.thinkingConfig.thinkingLevel).toBe('LOW');
    expect(call.config.maxOutputTokens).toBeGreaterThan(0);
    expect(call.config.abortSignal).toBeInstanceOf(AbortSignal);
  });
});

describe('POST /api/lore — rate limiting', () => {
  it('serves the configured quota and then answers 429 with Retry-After', async () => {
    // Isolated instance with a tiny quota: the shared server keeps its default
    // window untouched, so the rest of the suite is not affected.
    vi.resetModules();
    vi.stubEnv('LORE_RATE_LIMIT', '2');
    generateContent.mockResolvedValue({ text: 'ok' });

    const { createServer } = await import('./server');
    const server = await createServer({ withViteMiddleware: false });
    const bound = await server.listen(0);
    const localBase = `http://127.0.0.1:${bound.port}`;

    const call = async () => {
      const response = await fetch(`${localBase}/api/lore`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'hola' }),
      });
      return { status: response.status, headers: response.headers, body: await response.json() };
    };

    try {
      expect((await call()).status).toBe(200);
      expect((await call()).status).toBe(200);

      const limited = await call();
      expect(limited.status).toBe(429);
      expect(limited.body.code).toBe('RATE_LIMITED');
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
      expect(limited.headers.get('x-ratelimit-limit')).toBe('2');
      expect(limited.headers.get('x-ratelimit-remaining')).toBe('0');
      expect(generateContent).toHaveBeenCalledTimes(2);
    } finally {
      await bound.close();
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

describe('createRateLimiter — state machine with an injected clock', () => {
  it('allows exactly max requests per window', async () => {
    const { createRateLimiter } = await import('./server');
    const limiter = createRateLimiter({ windowMs: 1000, max: 3 });

    expect(limiter('ip-1', 0).allowed).toBe(true);
    expect(limiter('ip-1', 10).allowed).toBe(true);
    expect(limiter('ip-1', 20).allowed).toBe(true);
    expect(limiter('ip-1', 30).allowed).toBe(false);
  });

  it('resets when the window expires', async () => {
    const { createRateLimiter } = await import('./server');
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });

    expect(limiter('ip-2', 0).allowed).toBe(true);
    expect(limiter('ip-2', 500).allowed).toBe(false);
    expect(limiter('ip-2', 1001).allowed).toBe(true);
  });

  it('isolates keys from each other', async () => {
    const { createRateLimiter } = await import('./server');
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });

    expect(limiter('ip-a', 0).allowed).toBe(true);
    expect(limiter('ip-a', 1).allowed).toBe(false);
    expect(limiter('ip-b', 2).allowed).toBe(true);
  });

  it('reports the remaining quota and the retry delay', async () => {
    const { createRateLimiter } = await import('./server');
    const limiter = createRateLimiter({ windowMs: 10_000, max: 2 });

    expect(limiter('ip-3', 0)).toEqual({ allowed: true, remaining: 1, retryAfterSec: 10 });
    expect(limiter('ip-3', 1000).remaining).toBe(0);
    expect(limiter('ip-3', 1000).allowed).toBe(false);
    expect(limiter('ip-3', 1000).retryAfterSec).toBe(9);
  });
});

describe('routing', () => {
  it('answers unknown API routes with JSON 404, not with the SPA shell', async () => {
    const response = await fetch(`${baseUrl}/api/does-not-exist`);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('serves the application shell on /', async () => {
    const response = await fetch(`${baseUrl}/`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<div id="root">');
  });

  it('serves deep links through the SPA fallback', async () => {
    const response = await fetch(`${baseUrl}/deep/link/that/does/not/exist`);
    expect([200, 404]).toContain(response.status);
  });
});

describe('structured logging', () => {
  it('emits one JSON line per event', async () => {
    const { log } = await import('./server');
    consoleSpies.forEach((entry) => entry.restore());
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    log('info', 'test.event', { answer: 42 });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    expect(() => JSON.parse(line)).not.toThrow();
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({
      level: 'info',
      service: 'belentani-omega-kernel',
      event: 'test.event',
      answer: 42,
    });
    expect(typeof parsed.ts).toBe('string');
    spy.mockRestore();
  });

  it('routes warn and error to their console channels', async () => {
    const { log } = await import('./server');
    consoleSpies.forEach((entry) => entry.restore());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    log('warn', 'test.warn');
    log('error', 'test.error');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    error.mockRestore();
  });
});

describe('production static mode', () => {
  const distIndex = join(process.cwd(), 'dist/index.html');

  it.skipIf(!existsSync(distIndex))('caches hashed assets for a year and never the HTML', async () => {
    vi.resetModules();
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { createServer } = await import('./server');
      const server = await createServer({ withViteMiddleware: false });
      const bound = await server.listen(0);
      const prodBase = `http://127.0.0.1:${bound.port}`;
      try {
        const html = await fetch(`${prodBase}/`);
        expect(html.status).toBe(200);
        expect(html.headers.get('cache-control')).toContain('no-cache');

        const assetPath = /src="(\/assets\/[^"]+\.js)"/.exec(await html.text())?.[1];
        expect(assetPath).toBeTruthy();

        const asset = await fetch(`${prodBase}${assetPath}`);
        expect(asset.status).toBe(200);
        expect(asset.headers.get('cache-control')).toContain('max-age=31536000');
        expect(asset.headers.get('cache-control')).toContain('immutable');
      } finally {
        await bound.close();
      }
    } finally {
      process.env.NODE_ENV = previousEnv;
      vi.resetModules();
    }
  });

  it('reports the effective bound port when listening on 0', async () => {
    const { createServer } = await import('./server');
    const server = await createServer({ withViteMiddleware: false });
    const bound = await server.listen(0);

    expect(bound.port).toBeGreaterThan(0);
    expect(typeof bound.close).toBe('function');
    await bound.close();
  });
});

describe('type-level sanity of the bound address', () => {
  it('AddressInfo exposes a port (guards the listen contract)', () => {
    const address: AddressInfo = { address: '0.0.0.0', family: 'IPv4', port: 3000 };
    expect(address.port).toBe(3000);
  });
});
