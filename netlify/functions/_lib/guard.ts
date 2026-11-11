import { HttpError } from './http';
import { db } from './supabase';

/** Fixed-window rate limit stored in Postgres (works across serverless instances). */
export async function rateLimit(scope: string, ipHash: string, max: number, windowSeconds: number): Promise<void> {
  const { data, error } = await db().rpc('check_rate_limit', {
    p_key: `${scope}:${ipHash}`, p_max: max, p_window_seconds: windowSeconds,
  });
  if (error) {
    // Fail closed for writes: if we cannot count, we do not accept anonymous traffic.
    console.error('[rate-limit] failed', error.message);
    throw new HttpError(503, 'UNAVAILABLE', 'The service is busy. Please try again in a moment.');
  }
  if (data === false) {
    throw new HttpError(429, 'RATE_LIMITED', 'Too many requests. Please wait a few minutes and try again.');
  }
}

export interface AntiSpam {
  website?: string;
  elapsed_ms?: number;
  turnstile_token?: string;
}

/** Honeypot + minimum fill time + optional Cloudflare Turnstile verification. */
export async function checkSpam(antispam: AntiSpam | undefined, ip: string, minElapsedMs = 2500): Promise<void> {
  if (antispam?.website && antispam.website.trim() !== '') {
    throw new HttpError(400, 'REJECTED', 'Your request could not be processed.');
  }
  if ((antispam?.elapsed_ms ?? 0) < minElapsedMs) {
    throw new HttpError(400, 'TOO_FAST', 'Please take a moment to review the form, then submit again.');
  }
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return;
  if (!antispam?.turnstile_token) {
    throw new HttpError(400, 'CAPTCHA_REQUIRED', 'Please complete the verification challenge.');
  }
  const body = new URLSearchParams({ secret, response: antispam.turnstile_token });
  if (ip !== 'unknown') body.set('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const outcome = (await res.json().catch(() => ({}))) as { success?: boolean };
  if (!outcome.success) throw new HttpError(400, 'CAPTCHA_FAILED', 'Verification failed. Please try again.');
}
