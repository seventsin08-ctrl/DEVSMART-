import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { HttpError } from './http';

let cached: SupabaseClient | null = null;

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : undefined;
}

export function supabaseUrl(): string {
  const url = env('SUPABASE_URL') ?? env('VITE_SUPABASE_URL');
  if (!url) throw new HttpError(503, 'NOT_CONFIGURED', 'The service is not configured yet. Please try again later.');
  return url;
}

/** Service-role client. Bypasses RLS — only ever used inside serverless functions. */
export function db(): SupabaseClient {
  if (cached) return cached;
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new HttpError(503, 'NOT_CONFIGURED', 'The service is not configured yet. Please try again later.');
  cached = createClient(supabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}

export interface AdminSession {
  user: User;
  /** Client that acts AS the admin (RLS + is_admin() apply, auth.uid() is the admin). */
  asUser: SupabaseClient;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

/** Verifies the caller is an allowlisted admin with an MFA-verified (aal2) session. */
export async function requireAdmin(req: Request): Promise<AdminSession> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in.');

  // getUser() asks the auth server to validate the signature, expiry and session.
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');

  if (decodeJwtPayload(token).aal !== 'aal2') {
    throw new HttpError(403, 'MFA_REQUIRED', 'Multi-factor authentication is required.');
  }
  const { data: role, error: roleError } = await db()
    .from('admin_roles').select('role').eq('user_id', data.user.id).eq('is_active', true).maybeSingle();
  if (roleError || !role) throw new HttpError(403, 'FORBIDDEN', 'You do not have access to this area.');

  const apiKey = env('SUPABASE_ANON_KEY') ?? env('VITE_SUPABASE_ANON_KEY') ?? env('SUPABASE_SERVICE_ROLE_KEY')!;
  const asUser = createClient(supabaseUrl(), apiKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { user: data.user, asUser };
}
