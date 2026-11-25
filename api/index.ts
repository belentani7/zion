/**
 * Vercel serverless adapter.
 *
 * Vercel routes `/api/*` here (see vercel.json). The handler is the exact same
 * Express app that `npm start` boots, so there is one implementation of the
 * kernel — validation, allowlists, rate limiting, headers and error mapping —
 * and no duplicated route code to drift apart.
 *
 * `createApp()` is synchronous on purpose: a serverless entry point must not
 * rely on top-level await to export its handler.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server';

const app = createApp();

/**
 * The Vercel Node runtime calls the default export with plain Node
 * `(req, res)` objects — exactly what Express consumes — so no adapter package
 * is needed and no dependency is added for deployment.
 */
export default function handler(req: IncomingMessage, res: ServerResponse): void {
  app(req, res);
}
