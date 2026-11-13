import crypto from 'node:crypto';
import type { Context } from '@netlify/functions';
import { ZodError, type ZodType } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extra,
    },
  });
}

/** Reads and validates a JSON body with a hard size limit. */
export async function readBody<T>(req: Request, schema: ZodType<T>, maxBytes = 64 * 1024): Promise<T> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.');
  const text = await req.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'The request could not be read.');
  }
  const result = schema.safeParse(parsed);
  if (!result.success) throw fromZod(result.error);
  return result.data;
}

export function fromZod(error: ZodError): HttpError {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    if (!(key in fields)) fields[key] = issue.message;
  }
  return new HttpError(422, 'VALIDATION_FAILED', 'Please check the highlighted fields.', fields);
}

type Handler = (req: Request, context: Context) => Promise<Response>;

/** Wraps a function with method checks and safe error responses (no internals leak to clients). */
export function endpoint(methods: string[], fn: Handler): Handler {
  return async (req, context) => {
    try {
      if (!methods.includes(req.method)) {
        return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }, 405, { allow: methods.join(', ') });
      }
      // Same-origin browsers send no Origin on GET; for writes, reject foreign origins outright.
      const origin = req.headers.get('origin');
      if (origin && req.method !== 'GET') {
        const allowed = allowedOrigins(req);
        if (!allowed.has(origin)) return json({ error: { code: 'FORBIDDEN_ORIGIN', message: 'Forbidden.' } }, 403);
      }
      return await fn(req, context);
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: { code: err.code, message: err.message, fields: err.fields } }, err.status);
      }
      console.error('[api] unexpected error', err);
      return json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } }, 500);
    }
  };
}

function allowedOrigins(req: Request): Set<string> {
  const set = new Set<string>();
  for (const v of [process.env.SITE_URL, process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL]) {
    if (v) set.add(v.replace(/\/$/, ''));
  }
  try {
    // the function's own origin (handles custom domains and local dev)
    const url = new URL(req.url);
    set.add(url.origin);
    const fwdHost = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    if (fwdHost) {
      set.add(`https://${fwdHost}`);
      if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(fwdHost)) set.add(`http://${fwdHost}`);
    }
  } catch { /* ignore */ }
  for (const dev of (process.env.DEV_ALLOWED_ORIGINS ?? '').split(',')) if (dev.trim()) set.add(dev.trim());
  return set;
}

export function siteUrl(req: Request): string {
  const configured = process.env.SITE_URL ?? process.env.URL;
  if (configured) return configured.replace(/\/$/, '');
  const origin = req.headers.get('origin');
  if (origin) return origin;
  return new URL(req.url).origin;
}

export function clientIp(req: Request, context: Context): string {
  return (
    context?.ip ??
    req.headers.get('x-nf-client-connection-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/**
 * One-way hash so raw visitor IPs are never stored. The HMAC key is IP_HASH_SALT when set,
 * otherwise the service-role key (always present in production, never public, never output).
 */
export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'devmart-default-salt';
  return crypto.createHmac('sha256', salt).update(ip).digest('hex').slice(0, 40);
}

export function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
