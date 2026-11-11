import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
// "local" = same-origin proxy to the local development stack
const url = rawUrl === 'local' ? window.location.origin : rawUrl;

export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('YOUR-PROJECT-REF'));

/** Browser client. Uses only the public anon key; everything it can do is limited by RLS. */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'devmart-auth' } })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('The backend is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  return supabase;
}

/** Throws a readable Error for a failed PostgREST call, otherwise returns the data. */
export function unwrap<T>(result: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (result.error) {
    const msg = result.error.message;
    if (/LAST_OWNER/.test(msg)) throw new Error('You cannot remove or disable the last active owner.');
    if (/FORBIDDEN|permission denied|row-level security/i.test(msg)) throw new Error('You do not have permission to do that.');
    if (/duplicate key/i.test(msg)) throw new Error('That value is already in use. Choose a different one.');
    if (/violates foreign key/i.test(msg)) throw new Error('This record is still used elsewhere and cannot be removed.');
    if (/violates check constraint/i.test(msg)) throw new Error('One of the values is not valid. Please review the form.');
    throw new Error(msg);
  }
  return result.data as T;
}
