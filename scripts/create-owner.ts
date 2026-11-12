// Creates (or updates) the owner account: adds the e-mail to the admin allowlist and creates a
// confirmed Supabase Auth user. Run once after applying the migrations:
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run create-owner -- owner@example.com 'a-long-password'
//
// The service-role key is read from the environment (or .env.local) and never written anywhere.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

for (const file of ['.env', '.env.local']) {
  const p = path.resolve(import.meta.dirname, '..', file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const [email, password] = process.argv.slice(2);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !password || !url || !key) {
  console.error("Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run create-owner -- <email> '<password>'");
  process.exit(1);
}
if (password.length < 12) {
  console.error('Choose a password with at least 12 characters.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const normalized = email.trim().toLowerCase();

const { error: roleError } = await supabase.from('admin_roles').upsert({ email: normalized, role: 'owner', is_active: true }, { onConflict: 'email' });
if (roleError) {
  console.error('Could not update the allowlist:', roleError.message);
  process.exit(1);
}

const { data: created, error } = await supabase.auth.admin.createUser({ email: normalized, password, email_confirm: true });
if (error) {
  if (!/already|exists|registered/i.test(error.message)) {
    console.error('Could not create the user:', error.message);
    process.exit(1);
  }
  console.log('User already exists — allowlist entry confirmed. (Password unchanged.)');
} else {
  console.log(`Owner created: ${created.user?.email}`);
}
// link the role to the user if the trigger has not already done so
const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
const user = users?.users.find((u) => u.email?.toLowerCase() === normalized);
if (user) await supabase.from('admin_roles').update({ user_id: user.id }).eq('email', normalized).is('user_id', null);
console.log('Done. Sign in at /admin — you will be asked to set up two-step verification on first login.');
