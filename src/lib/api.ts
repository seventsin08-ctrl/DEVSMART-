import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

/** Calls a serverless function under /api. Adds the admin session token when `auth` is set. */
export async function api<T>(path: string, body: unknown, opts: { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.auth && supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.authorization = `Bearer ${data.session.access_token}`;
  }
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'NETWORK', 'We could not reach the server. Check your connection and try again.');
  }
  const text = await res.text();
  let payload: { error?: { code: string; message: string; fields?: Record<string, string> } } & Record<string, unknown>;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(res.status, 'BAD_RESPONSE', 'The server is not available right now. Please try again later.');
  }
  if (!res.ok) {
    const e = payload.error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? 'Something went wrong. Please try again.', e?.fields);
  }
  return payload as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}
