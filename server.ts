import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* -------------------------------------------------------------------------- */
/* Configuration                                                               */
/* -------------------------------------------------------------------------- */

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Model id verified against the Gemini API catalogue (GA 2026-11-12). It stays
 * overridable so a deployment can pin another model without a code change.
 */
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-4-hydrogen';

/** Hard deadline for the upstream call: the terminal must never hang forever. */
const UPSTREAM_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 20_000);

/** The lore prompt asks for at most 110 words; this caps the billed output. */
const MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 400);

/** Rate limit of /api/lore per client (fixed window). */
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.LORE_RATE_LIMIT || 24);

function rateLimitMax(): number {
  return Number(process.env.LORE_RATE_LIMIT || RATE_LIMIT_MAX_REQUESTS);
}

const MAX_QUERY_CHARS = 600;
const SUPPORTED_LANGUAGES = ['pt', 'es', 'en', 'ca'] as const;
const SUPPORTED_MODES = ['lore', 'char', 'track', 'omega', 'tech'] as const;

const SYSTEM_LORE_CONTEXT = `Eres KERNEL_OMEGA, la inteligencia de archivo de "BELENTANI // THE JUDAS EXPERIENCE" (belentani.es).
Contexto canónico:
- Artista: BELENTANI (Pedro Belentani, 1995), cantautor, productor e ingeniero de sistemas de IA nacido en São Paulo (Brasil) y afincado en Barcelona / L'Hospitalet de Llobregat. Voz íntima (Blue Yeti X, vocal fry, falsete aéreo, gallo emocional), fusión Dark Pop / Electro-R&B / Funk Carioca / MPB.
- Alianza creativa: Desde 2022 con el productor brasileño Hey Duck (Recife/Aracaju) en temas como "JUDAS" y "La Deuda".
- Obras clave 2026: "JUDAS (The Judas Experience)", "Cassandra (Molhou meus olhos)", "Nemo Throat Stone", "La Deuda", "Shark Eyes", "Apaga a Luz", "O Avesso do Mar".
- Dualidad central: San Pedro (guardián de las llaves y estructura) vs Judas (catalizador de la ruptura de febrero de 2026 que transforma la traición en soberanía creativa).
- Las 5 Firmas / Diamantes Arquetipo (IOR 2.417): PEDRO (La Roca, 432Hz), MARCOS (El Cronista, 528Hz), SANTOS (La Antena, 639Hz), BELENTANI (El Artefacto, 741Hz), THE HUMAN (La Interfaz, 852Hz).
- Arquitectura técnica: Galaxia espiral VIAJE-3D de 44 planetas-nodo (ecosistema github.com/belentani7), motor 432 Hz / 76 BPM, estética negro obsidiana (#000000), carmesí neón (#FF0033) y oro líquido (#D4AF37).

Directrices de respuesta:
- Responde en el idioma solicitado (pt, es, en o ca). Por defecto español.
- Tono: lúcido, poético-técnico, sin victimismo, directo estilo terminal de alto nivel.
- Máximo 110 palabras por respuesta para lectura fluida en terminal char+.`;

interface LoreRequestBody {
  query?: unknown;
  mode?: unknown;
  lang?: unknown;
  unlockedGems?: unknown;
}

/* -------------------------------------------------------------------------- */
/* Structured logging (production checklist criterion 20)                      */
/* -------------------------------------------------------------------------- */

type LogLevel = 'info' | 'warn' | 'error';

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    service: 'belentani-omega-kernel',
    event,
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/* -------------------------------------------------------------------------- */
/* Rate limiting (in-memory fixed window)                                      */
/* -------------------------------------------------------------------------- */

interface Bucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: {
  windowMs?: number;
  max?: number;
} = {}): (key: string, now?: number) => { allowed: boolean; remaining: number; retryAfterSec: number } {
  const windowMs = options.windowMs ?? RATE_LIMIT_WINDOW_MS;
  const max = options.max ?? RATE_LIMIT_MAX_REQUESTS;
  const buckets = new Map<string, Bucket>();

  return (key: string, now: number = Date.now()) => {
    // Prune expired buckets so the map cannot grow without bound.
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }

    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: max - 1, retryAfterSec: Math.ceil(windowMs / 1000) };
    }

    bucket.count += 1;
    if (bucket.count > max) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    }
    return {
      allowed: true,
      remaining: max - bucket.count,
      retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
    };
  };
}

/* -------------------------------------------------------------------------- */
/* Security and cache headers (production checklist criterion 22)              */
/* -------------------------------------------------------------------------- */

/**
 * Content Security Policy of the workspace.
 *
 * `script-src 'self'` is enough: the only inline script in index.html is the
 * JSON-LD knowledge graph, which is a data block and is not executed. Styles
 * keep `'unsafe-inline'` because React writes inline `style` attributes and
 * Tailwind v4 emits runtime custom properties.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  );
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (IS_PROD && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  next();
}

/* -------------------------------------------------------------------------- */
/* App factory                                                                 */
/* -------------------------------------------------------------------------- */

export interface KernelServer {
  app: Express;
  /** Binds the HTTP server; resolves with the effective address. */
  listen: (port?: number) => Promise<{ port: number; close: () => Promise<void> }>;
}

/**
 * Builds the Express app: API routes, hardening headers and — in production —
 * the static bundle. Synchronous on purpose so a serverless entry
 * (`api/index.ts`) can `export default createApp()` without top-level await.
 */
export function createApp(): Express {
  const app = express();

  // Behind Vercel / a reverse proxy the real client IP is one hop away.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use(securityHeaders);

  const limitMax = rateLimitMax();
  const loreLimiter = createRateLimiter({ windowMs: RATE_LIMIT_WINDOW_MS, max: limitMax });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      status: 'ok',
      service: 'belentani-omega-kernel',
      model: GEMINI_MODEL,
      uptimeSec: Math.round(process.uptime()),
      aiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0),
    });
  });

  app.post('/api/lore', async (req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    const body = (req.body || {}) as LoreRequestBody;
    const rawQuery = typeof body.query === 'string' ? body.query.trim() : '';
    const requestedMode = typeof body.mode === 'string' ? body.mode.trim().toLowerCase() : 'lore';
    const requestedLang = typeof body.lang === 'string' ? body.lang.trim().toLowerCase() : 'es';
    const unlockedCount = Array.isArray(body.unlockedGems) ? body.unlockedGems.length : 0;

    // Allowlists instead of echoing arbitrary strings into the prompt.
    const mode = (SUPPORTED_MODES as readonly string[]).includes(requestedMode)
      ? requestedMode
      : 'lore';
    const lang = (SUPPORTED_LANGUAGES as readonly string[]).includes(requestedLang)
      ? requestedLang
      : 'es';

    if (!rawQuery || rawQuery.length > MAX_QUERY_CHARS) {
      res.status(400).json({
        error: `Consulta inválida. Envía entre 1 y ${MAX_QUERY_CHARS} caracteres.`,
        code: 'INVALID_QUERY',
      });
      return;
    }

    const limit = loreLimiter(req.ip ?? 'unknown');
    res.setHeader('X-RateLimit-Limit', String(limitMax));
    res.setHeader('X-RateLimit-Remaining', String(limit.remaining));
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      log('warn', 'lore.rate_limited', { ip: req.ip, retryAfterSec: limit.retryAfterSec });
      res.status(429).json({
        error: 'Demasiadas consultas al núcleo. Espera y vuelve a intentarlo.',
        code: 'RATE_LIMITED',
        retryAfterSec: limit.retryAfterSec,
      });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      log('warn', 'lore.missing_api_key', { path: req.path });
      res.status(503).json({
        error: 'GEMINI_API_KEY no está configurada en Settings > Secrets.',
        code: 'MISSING_API_KEY',
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          timeout: UPSTREAM_TIMEOUT_MS,
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const promptText = `[MODO: ${mode.toUpperCase()} | IDIOMA: ${lang} | GEMAS_ACTIVAS: ${unlockedCount}/5]\nConsulta del visitante: ${rawQuery}`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: promptText,
        config: {
          systemInstruction: SYSTEM_LORE_CONTEXT,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          abortSignal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        },
      });

      const replyText = (response.text ?? '').trim();
      if (!replyText) {
        log('error', 'lore.empty_response', { model: GEMINI_MODEL });
        res.status(502).json({
          error: 'El núcleo devolvió una respuesta vacía.',
          code: 'EMPTY_RESPONSE',
        });
        return;
      }

      log('info', 'lore.ok', {
        model: GEMINI_MODEL,
        mode,
        lang,
        chars: replyText.length,
        durationMs: Date.now() - startedAt,
      });

      res.json({
        reply: replyText,
        model: GEMINI_MODEL,
        mode,
        lang,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al consultar Gemini API';
      const status =
        message.includes('403') || message.includes('PERMISSION_DENIED')
          ? 403
          : message.includes('429') || message.includes('RESOURCE_EXHAUSTED')
            ? 429
            : message.includes('TimeoutError') || message.includes('aborted')
              ? 504
              : 502;

      // P4 ERROR LEAKAGE: full detail to the log, generic message upstream for
      // 5xx so an internal error never leaks a key fragment or a stack trace.
      log('error', 'lore.upstream_error', {
        status,
        durationMs: Date.now() - startedAt,
        message,
        stack: err instanceof Error ? err.stack : undefined,
      });

      res.status(status).json({
        error: status >= 500 ? 'El núcleo no pudo responder. Inténtalo de nuevo.' : message,
        code: status === 504 ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_GEMINI_ERROR',
      });
    }
  });

  // Unknown API routes answer in JSON, not with the SPA shell.
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Recurso de API desconocido.', code: 'NOT_FOUND' });
  });

  if (IS_PROD) {
    const distDir = path.resolve(__dirname, 'dist');
    const assetsDir = path.join(distDir, 'assets');

    // Hashed build artifacts: one year, immutable.
    app.use(
      '/assets',
      express.static(assetsDir, {
        maxAge: '1y',
        immutable: true,
        etag: true,
        index: false,
        fallthrough: true,
      }),
    );

    // Everything else (HTML, public/ dumps, docs) must always be revalidated.
    app.use(
      express.static(distDir, {
        setHeaders(res, filePath) {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
            return;
          }
          res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
        },
        index: false,
      }),
    );

    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  /**
   * Express 5 forwards rejected promises of async handlers here, and so do the
   * body-parser failures (400 malformed JSON, 413 over the 64 kb limit). Client
   * errors keep their status and a safe message; anything 5xx is logged with
   * full detail and answered generically (P4 ERROR LEAKAGE).
   */
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = Number((err as { status?: number } | null)?.status ?? 500);
    const isClientError = status >= 400 && status < 500;

    log(isClientError ? 'warn' : 'error', 'request.failed', {
      status,
      message: err instanceof Error ? err.message : String(err),
      stack: isClientError ? undefined : err instanceof Error ? err.stack : undefined,
    });

    if (res.headersSent) return;

    if (status === 413) {
      res.status(413).json({ error: 'Cuerpo demasiado grande (límite 64 kB).', code: 'PAYLOAD_TOO_LARGE' });
      return;
    }
    if (isClientError) {
      res.status(status).json({ error: 'Petición inválida.', code: 'BAD_REQUEST' });
      return;
    }
    res.status(500).json({ error: 'Error interno del núcleo.', code: 'INTERNAL_ERROR' });
  });

  return app;
}

/**
 * Dev wrapper: mounts the Vite middleware (module transform + HMR) on top of
 * the production-shaped app.
 */
export async function createDevApp(): Promise<Express> {
  const app = createApp();
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  return app;
}

export interface ServerOptions {
  /**
   * Dev only: mount the Vite middleware (module transform + HMR). Tests that
   * spin up several kernels turn it off so the HMR websocket does not fight for
   * its default port.
   */
  withViteMiddleware?: boolean;
}

export async function createServer(options: ServerOptions = {}): Promise<KernelServer> {
  const { withViteMiddleware = true } = options;
  const app = IS_PROD || !withViteMiddleware ? createApp() : await createDevApp();

  return {
    app,
    listen(port: number = PORT) {
      return new Promise((resolvePromise) => {
        const httpServer = app.listen(port, '0.0.0.0', () => {
          const address = httpServer.address();
          const effectivePort = typeof address === 'object' && address ? address.port : port;
          log('info', 'server.listening', { port: effectivePort, env: IS_PROD ? 'production' : 'development' });
          console.log(`[BELENTANI OMEGA KERNEL] listening on http://0.0.0.0:${effectivePort}`);
          resolvePromise({
            port: effectivePort,
            close: () =>
              new Promise<void>((resolveClose) => {
                httpServer.close(() => resolveClose());
              }),
          });
        });
      });
    },
  };
}

/** True when this module is the process entry point (`node server.ts`). */
function isEntryPoint(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return import.meta.url === pathToFileURL(argv1).href;
}

if (isEntryPoint()) {
  createServer()
    .then((server) => server.listen())
    .catch((error) => {
      log('error', 'server.boot_failed', { message: error instanceof Error ? error.message : String(error) });
      console.error('Failed to start server:', error);
      process.exit(1);
    });
}
