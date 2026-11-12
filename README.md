# DevMart

Website and business management platform for **DevMart**, a Philippines-based studio that builds affordable custom websites, mobile apps, booking systems and business software.

- Always-dark, Apple-inspired Liquid Glass design with a studio-style "assemble" animation
- Public storefront (12 pages), multi-step ordering, secure order tracking, manual payments with proof upload
- Admin dashboard at `/admin` (18 sections) with mandatory two-step verification
- **Branding Studio**: visual editor with a live preview, undo/redo, drafts, publishing and version rollback
- Currency: Philippine peso (stored as whole centavos) · Time zone: Asia/Manila

> **Nothing is deployed by this repository on its own.** You need your own Supabase project and a Netlify site. Setup takes about 15 minutes and is described below.

---

## Technology

| Layer | Choice |
| --- | --- |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS 4, Motion, Lucide icons, React Hook Form + Zod, Recharts, TanStack Query |
| Backend | Supabase (PostgreSQL, Auth with TOTP MFA, Storage, Row Level Security) |
| Privileged logic | Netlify Functions (`netlify/functions`) + `SECURITY DEFINER` SQL functions |
| PDFs | `pdf-lib` (generated on the server, stored in a private bucket) |
| Hosting | Netlify (config in `netlify.toml`) |

Everything fits in the free tiers of Supabase and Netlify.

## Project layout

```
supabase/migrations/   database schema, functions, RLS, storage buckets, seed data
supabase/tests/        SQL security tests (55 checks)
netlify/functions/     /api/* endpoints: order-quote, order-create, order-track, payment-submit, contact, admin-action
shared/                code used by both browser and server: pricing, validation, site schema, PDF generator
src/site/              the public website renderer (also used by the studio preview)
src/admin/             admin dashboard
src/studio/            Branding Studio (editor + live preview)
tests/unit, tests/e2e  Vitest unit tests and Playwright end-to-end tests
dev/stack/             local Supabase-compatible stack (Docker) for development and tests
```

---

## Setup

### 1. Create the Supabase project

1. Create a project at <https://supabase.com> (region: Singapore is closest to the Philippines).
2. Run the migrations **in order**. Either paste each file of `supabase/migrations/` into **SQL Editor → New query → Run**, or use the CLI:
   ```bash
   npx supabase link --project-ref YOUR-PROJECT-REF
   npx supabase db push
   ```
   This creates all tables, security policies, the three storage buckets (`media` public, `payment-proofs` and `documents` private) and the six starting services.
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up". There is no public admin registration.
4. **Authentication → Multi-Factor**: make sure **TOTP** is enabled (it is by default).
5. Optional: **Database → Publications → supabase_realtime**: the migration already adds `notifications`; this gives live notification updates (the dashboard also polls every 45 seconds).

### 2. Create the owner account

```bash
cp .env.example .env.local      # then fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm install
npm run create-owner -- you@example.com 'a-long-unique-password'
```

This adds your email to the admin allowlist and creates a confirmed user. On first sign-in at `/admin` you are required to scan a QR code with an authenticator app (Google Authenticator, Authy, 1Password…). Without that second factor the database refuses all admin access.

Prefer doing it by hand? Run `insert into admin_roles (email, role) values ('you@example.com', 'owner');` in the SQL editor, then add the user under **Authentication → Users → Add user** (tick *Auto Confirm*).

### 3. Deploy to Netlify

1. **Add new site → Import an existing project** and pick this repository. Build settings are read from `netlify.toml`.
2. **Site configuration → Environment variables** — add:

| Variable | Where it is used | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | browser | Project URL |
| `VITE_SUPABASE_ANON_KEY` | browser | anon / publishable key (safe to expose) |
| `SUPABASE_URL` | functions | same Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | functions only | **secret** — never prefix with `VITE_` |
| `SITE_URL` | functions | your public URL, e.g. `https://devmart.netlify.app` |
| `IP_HASH_SALT` | functions | any long random string |
| `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_NOTIFY_EMAIL` | functions | optional — transactional email |
| `VITE_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | browser / functions | optional — Cloudflare Turnstile on public forms |

3. Deploy. Then sign in at `/admin`, open **Payments → Payment methods**, enter your real GCash / Maya / bank details and QR codes, and enable them. Fill in your contact details under **Branding Studio → Brand → Contact details** and press **Publish**.

If your Supabase project is not on `*.supabase.co`, update the `connect-src` entry of the Content-Security-Policy in `netlify.toml`.

### What works without optional credentials

| Feature | Without the optional keys |
| --- | --- |
| Email (tracking links, payment decisions, new-order alerts) | Not sent. In-app notifications still work, and the confirmation page shows the tracking link. Admins can create a new link from the order page and send it by Messenger/SMS. "Request a new link" tells the customer to contact DevMart. |
| CAPTCHA | Honeypot field, minimum fill time and database-backed rate limits still apply. |
| Online payment gateway | Not integrated. Payments are manual (GCash, Maya, bank, custom) and verified by an admin. |

---

## Local development

**Frontend only** (no backend; the storefront renders built-in defaults):

```bash
npm install
npm run dev
```

**Full stack with Docker** (real Postgres, Auth, REST and Storage — the same services Supabase runs):

```bash
bash dev/tools/start-all.sh     # starts the stack, applies migrations, starts the API and Vite
npm run create-owner -- owner@devmart.test 'Local-Dev-Passw0rd!'
# app: http://127.0.0.1:5173   admin: http://127.0.0.1:5173/admin
npm run stack:down              # stop
```

`npm run dev:api` serves the Netlify functions locally on port 8788 (Vite proxies `/api`). You can also use `netlify dev`.

## Testing

```bash
npm run lint         # ESLint
npm run typecheck    # TypeScript
npm test             # 24 unit tests: pricing, discounts, money, validation, URL safety, PDF, undo/redo
npm run test:db      # 55 SQL checks: RLS, payment rules, publishing, rate limits (needs the local stack)
npm run test:e2e     # 6 browser tests against the local stack (needs start-all.sh)
npm run build        # production build
```

The end-to-end suite covers: all 12 pages at phone width without horizontal scrolling, anonymous access being refused by the database, placing an order with a promo code (server-side price check), token-only tracking, payment proof upload (and rejection of a fake file), admin sign-in with TOTP, payment verification with automatic receipt, project creation, analytics, and the studio (live preview, click-to-select, undo/redo, save draft, draft not public, publish, rollback, mobile tabs).

---

## How it works

### Ordering and pricing
The browser shows estimates only. `order-create` reloads the service, package, add-ons and promotions from the database, recomputes every amount (`shared/pricing.ts`), and stores the order in one transaction (`create_order_tx`). Order references (`DVM-2026-000001`) come from a locked per-year counter. Each order keeps its own copy of item names and prices, and those columns cannot be updated from a browser session — later catalogue changes never alter past orders.

One discount applies per order: a valid promo or referral code wins; otherwise the best automatic, first-order or loyalty promotion. Discounts are floored to whole centavos and can never exceed the subtotal.

### Tracking
Order references are sequential and therefore guessable, so they unlock nothing. Each order gets a random 256-bit token; only its SHA-256 hash is stored. Tracking links expire (30 days by default, configurable) and can be revoked or reissued by an admin.

### Payments
Customers choose a method, pay externally, and upload a JPG/PNG/PDF (max 4 MB). The server checks the real file type from its bytes, stores it under a random name in a private bucket, and marks the order *Proof Submitted*. **Nothing verifies a payment automatically.** Only `admin_review_payment` (admin + MFA) can verify, reject or refund; it writes the ledger entry, updates the order and awards loyalty points in one transaction. Receipts are issued only for verified ledger entries (also enforced by a database constraint). Order summaries, quotations, invoices and acknowledgments state clearly that they are not receipts.

### Branding Studio
The whole site (theme, brand, navigation, footer, buttons, form texts and every page's sections) is one validated JSON document (`shared/site/schema.ts`). The studio edits a **draft**; the public only ever receives the **published** copy through `get_published_site()`. Publishing snapshots a version; restoring a version loads it into the draft and goes live only when you publish again. The preview is an iframe that renders the same components as the public site.

Content is plain text, numbers, enumerated options and sanitised URLs — there is no HTML, CSS or script input anywhere, and URLs such as `javascript:` are rejected on save and again at render time.

Service and add-on **prices** in the studio's Pricing tab are business data: they save immediately and are not part of draft/publish.

### Security summary
- RLS on every table. Anonymous users can read only the active catalogue, published portfolio, active payment methods and advertised promotions.
- Admin = allowlisted email **and** an MFA-verified session (`aal2`), checked in the database (`is_admin()`) and again in every admin serverless call.
- Even admins cannot directly edit paid amounts, payment status, the payment ledger, order price snapshots or the audit log; those change only through audited SQL functions.
- The service-role key exists only in Netlify function environment variables.
- Public endpoints: Zod validation, body size limits, same-origin check, honeypot, minimum fill time, optional Turnstile, per-IP rate limits (IPs are stored only as salted hashes).
- Security headers and a Content-Security-Policy are set in `netlify.toml`.
- Audit log (append-only) for catalogue, orders, payments, documents, admin roles, publishing.

### Known limits
- Contract terms are a starting template — have a lawyer review them.
- Loyalty points are earned and can be adjusted by an admin; redeeming points at checkout is not built (use a loyalty promotion instead).
- Staff roles (`owner`, `admin`, `staff`) are stored but currently share the same permissions.
- Deadline notifications are generated when an admin opens the Overview page (no background scheduler).
- Custom pages cannot be added; the 12 built-in pages are fully editable.
