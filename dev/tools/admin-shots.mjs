// Signs in as a fresh local owner (with TOTP) and screenshots admin pages. Local stack only.
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import * as OTPAuth from 'otpauth';
const out = process.argv[2];
const env = Object.fromEntries(readFileSync('dev/stack/.env.stack', 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const service = createClient('http://127.0.0.1:54321', env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OWNER = { email: 'owner@devmart.test', password: 'Local-Dev-Passw0rd!' };
const { data: users } = await service.auth.admin.listUsers();
for (const u of users.users.filter((x) => x.email === OWNER.email)) await service.auth.admin.deleteUser(u.id);
await service.from('admin_roles').upsert({ email: OWNER.email, role: 'owner', is_active: true, user_id: null }, { onConflict: 'email' });
await service.auth.admin.createUser({ ...OWNER, email_confirm: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://127.0.0.1:5173/admin');
await p.getByLabel('Email').fill(OWNER.email);
await p.getByLabel('Password').fill(OWNER.password);
await p.getByRole('button', { name: 'Sign in' }).click();
const secret = (await p.getByTestId('totp-secret').textContent()).trim();
await p.screenshot({ path: `${out}/admin-mfa.png` });
await p.getByLabel(/6-digit code/).fill(new OTPAuth.TOTP({ secret }).generate());
await p.getByRole('button', { name: 'Verify' }).click();
await p.getByRole('heading', { name: 'Overview' }).waitFor();
for (const [path, name] of [['', 'overview'], ['orders', 'orders'], ['payments', 'payments'], ['services', 'services'], ['discounts', 'discounts'], ['analytics', 'analytics'], ['customers', 'customers'], ['projects', 'projects'], ['media', 'media'], ['security', 'security'], ['settings', 'settings'], ['notifications', 'notifications'], ['contracts', 'contracts'], ['receipts', 'receipts'], ['pricing', 'pricing'], ['portfolio', 'portfolio']]) {
  await p.goto(`http://127.0.0.1:5173/admin/${path}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/admin-${name}.png` });
  const of = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (of > 1) console.log('OVERFLOW desktop', name, of);
}
const first = await service.from('orders').select('id').limit(1).maybeSingle();
if (first.data) { await p.goto(`http://127.0.0.1:5173/admin/orders/${first.data.id}`, { waitUntil: 'networkidle' }); await p.screenshot({ path: `${out}/admin-order.png`, fullPage: true }); }
await p.goto('http://127.0.0.1:5173/admin/studio', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}/studio.png` });
await p.getByRole('tab', { name: 'Sections' }).click();
await p.frameLocator('iframe[title="Live website preview"]').locator('h1').click();
await p.getByRole('button', { name: 'mobile preview' }).click();
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/studio-inspector-mobile-preview.png` });
// phone-sized admin
await p.setViewportSize({ width: 390, height: 844 });
for (const path of ['', 'orders', 'payments', 'services', 'analytics', 'studio', 'security', 'customers']) {
  await p.goto(`http://127.0.0.1:5173/admin/${path}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  const of = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (of > 1) console.log('OVERFLOW phone', path || 'overview', of);
  if (['', 'studio', 'orders'].includes(path)) await p.screenshot({ path: `${out}/m-admin-${path || 'overview'}.png` });
}
console.log('done; page errors:', errs.slice(0, 5));
await b.close();
