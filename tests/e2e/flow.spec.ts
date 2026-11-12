// Full business flow against a real (local) Supabase stack:
// public pages → order → tracking → payment proof → admin login + MFA → verification → studio publish.
import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import * as OTPAuth from 'otpauth';
import { PAGE_PATHS } from '../../shared/site/schema';

const env = Object.fromEntries(readFileSync('dev/stack/.env.stack', 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const GATEWAY = 'http://127.0.0.1:54321';
const service = createClient(GATEWAY, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OWNER = { email: 'owner@devmart.test', password: 'Local-Dev-Passw0rd!' };
// 1×1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

let reference = '';
let trackingUrl = '';
let totpSecret = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  // fresh owner (no MFA factor), clean rate limits, one usable payment method
  // local test database only: start from an empty order book
  for (const table of ['documents', 'payment_transactions', 'orders', 'customers', 'notifications']) await service.from(table).delete().not('id', 'is', null);
  const { data: users } = await service.auth.admin.listUsers();
  for (const u of users.users.filter((x) => x.email === OWNER.email)) await service.auth.admin.deleteUser(u.id);
  await service.from('admin_roles').upsert({ email: OWNER.email, role: 'owner', is_active: true, user_id: null }, { onConflict: 'email' });
  const { error } = await service.auth.admin.createUser({ ...OWNER, email_confirm: true });
  expect(error).toBeNull();
  await service.from('rate_limits').delete().neq('key', '');
  await service.from('payment_methods').update({ is_active: true, account_holder: 'DevMart Test', account_number: '0917 000 0000' }).eq('kind', 'gcash');
  await service.from('promotions').delete().eq('code', 'E2E10');
  await service.from('promotions').insert({ name: 'E2E ten percent', kind: 'promo_code', code: 'E2E10', discount_type: 'percent', percent_bps: 1000 });
});

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

test('every public page renders on a phone without horizontal scrolling', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const path of Object.values(PAGE_PATHS)) {
    await page.goto(path, { waitUntil: 'networkidle' });
    await expect(page.locator('h1').first()).toBeVisible();
    await noOverflow(page);
  }
  // mobile navigation opens and navigates
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.locator('#mobile-menu').getByRole('link', { name: 'Pricing' }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  expect(errors).toEqual([]);
  await page.close();
});

test('the database refuses anonymous access to private data', async ({ request }) => {
  const headers = { apikey: env.ANON_KEY, authorization: `Bearer ${env.ANON_KEY}`, 'content-type': 'application/json' };
  for (const table of ['orders', 'customers', 'payment_submissions', 'payment_transactions', 'audit_logs', 'order_access_tokens', 'promotions', 'website_pages', 'admin_roles']) {
    const res = await request.get(`${GATEWAY}/rest/v1/${table}?select=*`, { headers });
    expect([401, 403], table).toContain(res.status());
  }
  for (const rpc of ['get_site_draft', 'publish_site', 'create_order_tx', 'check_rate_limit', 'next_reference']) {
    const res = await request.post(`${GATEWAY}/rest/v1/rpc/${rpc}`, { headers, data: {} });
    expect(res.status(), rpc).toBeGreaterThanOrEqual(400);
  }
  expect((await request.get(`${GATEWAY}/rest/v1/services?select=name`, { headers })).status()).toBe(200);
  // private buckets are not publicly readable
  expect((await request.get(`${GATEWAY}/storage/v1/object/public/payment-proofs/x.png`)).status()).toBeGreaterThanOrEqual(400);
});

test('a customer can place an order with a discount and gets a private tracking link', async ({ page }) => {
  await page.goto('/start-a-project');
  await page.getByRole('radio', { name: /Business Website/ }).click();
  await page.getByText('Logo design').click();
  await page.getByLabel(/Promo or referral code/).fill('e2e10');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Continue' }).click(); // empty → validation errors
  await expect(page.getByText('Give your project a name')).toBeVisible();
  await page.getByLabel(/Project name/).fill('E2E Bakery Website');
  await page.getByLabel(/Project description/).fill('A website for our bakery with a menu and contact form.');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByLabel(/Full name/).fill('Juan Dela Cruz');
  await page.getByLabel(/Email address/).fill('juan@example.com');
  await page.getByLabel(/mobile number/i).fill('0917 123 4567');
  await page.getByLabel(/Facebook profile/).fill('fb.com/juan.delacruz');
  await page.getByRole('button', { name: 'Review order' }).click();
  await expect(page.getByText('Please agree to the privacy policy')).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Review order' }).click();

  // server-priced: 6,000 + 1,500 = 7,500; 10% off = 750; total 6,750
  await expect(page.getByText('₱7,500')).toBeVisible();
  await expect(page.getByText('− ₱750')).toBeVisible();
  await expect(page.getByText('₱6,750')).toBeVisible();
  await page.waitForTimeout(4200); // anti-spam minimum fill time
  await page.getByRole('button', { name: 'Submit order' }).click();

  await expect(page.getByTestId('order-reference')).toHaveText(/^DVM-\d{4}-\d{6}$/);
  reference = (await page.getByTestId('order-reference').textContent())!;
  trackingUrl = (await page.getByTestId('tracking-url').textContent())!;
  await expect(page.getByText('Pending Review', { exact: true })).toBeVisible();
  const pdf = await page.request.get((await page.getByRole('link', { name: /Download order summary/ }).getAttribute('href'))!);
  expect(pdf.headers()['content-type']).toContain('pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

  const { data: order } = await service.from('orders').select('*').eq('reference', reference).single();
  expect(order).toMatchObject({ status: 'pending_review', payment_status: 'awaiting_payment', subtotal_centavos: 750000, discount_centavos: 75000, total_centavos: 675000, promo_code: 'E2E10' });
});

test('tracking needs the private token; the reference alone reveals nothing', async ({ page, request }) => {
  const bad = await request.post('/api/order-track', { data: { action: 'view', token: 'x'.repeat(43) } });
  expect(bad.status()).toBe(404);
  await page.goto(trackingUrl);
  await expect(page.getByText(reference).first()).toBeVisible();
  await expect(page.getByText('E2E Bakery Website').first()).toBeVisible();
  await expect(page.getByText('Order Summary').first()).toBeVisible();
});

test('a payment proof is stored for review and never auto-verified', async ({ page, request }) => {
  const token = new URL(trackingUrl).searchParams.get('t')!;
  const { data: method } = await service.from('payment_methods').select('id').eq('kind', 'gcash').single();
  // a text file renamed to .png is rejected by content sniffing
  const fake = await request.post('/api/payment-submit', { data: { token, payment_method_id: method!.id, payment_type: 'deposit', transaction_reference: 'FAKE-1', file: { name: 'x.png', type: 'image/png', data: Buffer.from('<script>alert(1)</script>').toString('base64') } } });
  expect(fake.status()).toBe(422);

  await page.goto(`/payment?t=${token}`);
  await page.getByRole('radio', { name: /GCash/ }).click();
  await expect(page.getByText('0917 000 0000')).toBeVisible();
  await page.getByLabel(/Amount you sent/).fill('3,000');
  await page.getByLabel(/Transaction \/ reference number/).fill('GC-778899');
  await page.locator('input[type=file]').setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: 'Submit for verification' }).click();
  await expect(page.getByText(/awaiting verification/)).toBeVisible();

  const { data: order } = await service.from('orders').select('payment_status, amount_paid_centavos').eq('reference', reference).single();
  expect(order).toEqual({ payment_status: 'proof_submitted', amount_paid_centavos: 0 });
});

test('the owner signs in with MFA, verifies the payment and a receipt is issued', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Incorrect email or password.')).toBeVisible();
  await page.getByLabel('Password').fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('Set up two-step verification')).toBeVisible();
  totpSecret = (await page.getByTestId('totp-secret').textContent())!.trim();
  await page.getByLabel(/6-digit code/).fill(new OTPAuth.TOTP({ secret: totpSecret }).generate());
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByText(reference).first()).toBeVisible();

  await page.getByRole('link', { name: 'Payments', exact: true }).click();
  await expect(page.getByText('GC-778899').first()).toBeVisible();
  await page.getByRole('button', { name: 'Approve…' }).click();
  await page.getByRole('button', { name: 'Verify payment' }).click();
  await expect(page.getByText(/Payment verified/).first()).toBeVisible();

  const { data: order } = await service.from('orders').select('id, status, payment_status, amount_paid_centavos').eq('reference', reference).single();
  expect(order).toMatchObject({ status: 'payment_verified', payment_status: 'verified', amount_paid_centavos: 300000 });
  const { data: docs } = await service.from('documents').select('kind').eq('order_id', order!.id);
  expect(docs!.map((d) => d.kind).sort()).toEqual(['order_summary', 'payment_acknowledgment', 'receipt']);

  // order page: move to development → project with milestones appears
  await page.goto(`/admin/orders/${order!.id}`);
  await page.getByLabel('Status', { exact: true }).selectOption('in_development');
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(page.getByText('Status updated').first()).toBeVisible();
  await page.getByRole('link', { name: 'Projects', exact: true }).click();
  await expect(page.getByText('Requirements & planning').first()).toBeVisible();
  await page.getByRole('link', { name: 'Analytics', exact: true }).click();
  await expect(page.getByText('Verified revenue').first()).toBeVisible();
  await expect(page.getByText('₱3,000').first()).toBeVisible();

  // the customer now sees the verified payment and the receipt
  const customer = await page.context().browser()!.newPage();
  await customer.goto(trackingUrl);
  await expect(customer.getByText('In Development').first()).toBeVisible();
  await expect(customer.getByText('Payment Receipt').first()).toBeVisible();
  await customer.close();

  // ── Branding Studio: drafts stay private until published; versions can be restored ──
  await page.goto('/admin/studio');
  const preview = page.frameLocator('iframe[title="Live website preview"]');
  await expect(preview.locator('h1')).toContainText('Your ideas.');
  await page.getByRole('textbox', { name: 'Business name' }).fill('DevMart Studio QA');
  await expect(preview.getByText('DevMart Studio QA').first()).toBeVisible(); // live preview updates immediately
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('textbox', { name: 'Business name' })).toHaveValue('DevMart');
  await page.getByRole('button', { name: 'Redo' }).click();

  await page.getByRole('tab', { name: 'Sections' }).click();
  await preview.locator('h1').click(); // click-to-select in the preview opens the inspector
  await page.getByRole('textbox', { name: 'Headline', exact: true }).fill('Built for QA. Published on purpose.');
  await page.getByRole('button', { name: /Save draft/ }).click();
  await expect(page.getByText('Draft saved · not published').first()).toBeVisible();

  const visitor = await page.context().browser()!.newPage();
  await visitor.goto('/');
  await expect(visitor.locator('h1')).toContainText('Your ideas.'); // draft is NOT public
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByRole('button', { name: 'Publish now' }).click();
  await expect(page.getByText(/Published as version 1/)).toBeVisible();
  await visitor.reload();
  await expect(visitor.locator('h1')).toContainText('Built for QA.');
  await expect(visitor.getByText('DevMart Studio QA').first()).toBeVisible();

  // second publish, then roll back to version 1
  await page.getByRole('textbox', { name: 'Headline', exact: true }).fill('Second version.');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByRole('button', { name: 'Publish now' }).click();
  await expect(page.getByText(/Published as version 2/)).toBeVisible();
  await page.getByRole('button', { name: 'Version history' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Version 1' }).getByRole('button', { name: /Restore to draft/ }).click();
  await expect(page.getByText(/Version loaded into your draft/)).toBeVisible();
  await visitor.reload();
  await expect(visitor.locator('h1')).toContainText('Second version.'); // restore alone changes nothing publicly
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByRole('button', { name: 'Publish now' }).click();
  await expect(page.getByText(/Published as version 3/)).toBeVisible();
  await visitor.reload();
  await expect(visitor.locator('h1')).toContainText('Built for QA.');
  await visitor.close();

  // studio stays usable on a phone: separate Editor / Preview tabs
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Preview', exact: true }).click();
  await expect(page.locator('iframe[title="Live website preview"]')).toBeVisible();
  await page.getByRole('tab', { name: 'Editor', exact: true }).click();
  await noOverflow(page);
});

test.afterAll(async () => {
  // put the published site back to the built-in defaults so the dev stack stays clean
  await service.from('website_pages').delete().neq('slug', '');
  await service.from('website_page_versions').delete().gt('version_number', 0);
  await service.from('theme_settings').update({ draft: {}, published: null }).eq('id', 1);
  await service.from('website_settings').delete().in('key', ['brand', 'navigation', 'footer', 'buttons', 'forms']);
});
