-- ============================================================================
-- DevMart: complete database setup (generated file, do not edit)
-- Contains: 0001_schema.sql, 0002_functions.sql, 0003_security.sql, 0004_seed.sql
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run, ONCE, on an empty project.
-- Supabase may show a yellow "destructive operations" warning (the script contains the word
-- "delete" in table rules). That is expected: choose "Run this query".
-- Regenerate with: npm run build:sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0001_schema.sql
-- ---------------------------------------------------------------------------
-- DevMart — core schema
-- Money is stored as integer centavos (bigint). 1 PHP = 100 centavos. No floating point.
-- Timestamps are timestamptz; business dates are interpreted in Asia/Manila.

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────────────────── identity ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Owner / admin allowlist. A row is created by e-mail first; it is linked to the
-- auth user (user_id) automatically once that confirmed user exists.
create table public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  email text not null unique check (email = lower(email) and position('@' in email) > 1),
  role text not null default 'owner' check (role in ('owner', 'admin', 'staff')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────── customers ─────────────────────────
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  full_name text not null check (char_length(full_name) between 1 and 200),
  email text not null check (email = lower(email) and position('@' in email) > 1),
  phone text not null default '',
  facebook_contact text not null default '',
  notes text not null default '',
  referral_code text not null unique,
  referred_by uuid references public.customers (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customers_email_key on public.customers (email);
create index customers_created_idx on public.customers (created_at desc);

-- ───────────────────────── catalogue ─────────────────────────
create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 120),
  short_description text not null default '',
  description text not null default '',
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  icon text not null default 'Globe',
  image_url text,
  starting_price_centavos bigint not null check (starting_price_centavos >= 0),
  delivery_days_min integer check (delivery_days_min is null or delivery_days_min > 0),
  delivery_days_max integer check (delivery_days_max is null or delivery_days_max > 0),
  is_active boolean not null default true,
  is_archived boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (delivery_days_min is null or delivery_days_max is null or delivery_days_max >= delivery_days_min)
);
create index services_public_idx on public.services (sort_order) where is_active and not is_archived;

-- service_id null = add-on available for every service
create table public.service_addons (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  price_centavos bigint not null check (price_centavos >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_addons_service_idx on public.service_addons (service_id);

-- Optional fixed-price tiers of a service (e.g. Starter / Pro)
create table public.service_packages (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  price_centavos bigint not null check (price_centavos >= 0),
  delivery_days integer check (delivery_days is null or delivery_days > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_packages_service_idx on public.service_packages (service_id);

-- ───────────────────────── promotions ─────────────────────────
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  kind text not null check (kind in ('promo_code', 'automatic', 'first_order', 'loyalty', 'referral')),
  code text unique check (code is null or code = upper(code)),
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  percent_bps integer check (percent_bps is null or percent_bps between 1 and 10000),
  fixed_centavos bigint check (fixed_centavos is null or fixed_centavos > 0),
  max_discount_centavos bigint check (max_discount_centavos is null or max_discount_centavos > 0),
  min_subtotal_centavos bigint not null default 0 check (min_subtotal_centavos >= 0),
  min_completed_orders integer not null default 0 check (min_completed_orders >= 0),
  service_ids uuid[] not null default '{}',
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  per_customer_limit integer check (per_customer_limit is null or per_customer_limit > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  is_active boolean not null default true,
  show_on_site boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((discount_type = 'percent' and percent_bps is not null and fixed_centavos is null)
      or (discount_type = 'fixed' and fixed_centavos is not null and percent_bps is null)),
  check ((kind = 'promo_code') = (code is not null)),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);

-- ───────────────────────── orders ─────────────────────────
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^DVM-[0-9]{4}-[0-9]{6,}$'),
  customer_id uuid not null references public.customers (id) on delete restrict,
  service_id uuid references public.services (id) on delete set null,
  status text not null default 'pending_review' check (status in (
    'pending_review', 'contacted', 'quotation_sent', 'awaiting_approval', 'awaiting_deposit',
    'payment_under_review', 'payment_verified', 'in_development', 'revision',
    'awaiting_final_payment', 'completed', 'cancelled')),
  payment_status text not null default 'awaiting_payment' check (payment_status in (
    'awaiting_payment', 'proof_submitted', 'under_review', 'verified', 'rejected', 'refunded')),
  -- project requirements
  project_name text not null check (char_length(project_name) between 1 and 200),
  project_description text not null default '',
  requested_features text not null default '',
  preferred_design text not null default '',
  reference_websites text not null default '',
  target_deadline date,
  budget_range text not null default '',
  additional_notes text not null default '',
  -- customer snapshot at time of order
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  customer_facebook text not null,
  privacy_consent_at timestamptz not null,
  -- pricing snapshot (never recalculated from the live catalogue)
  subtotal_centavos bigint not null check (subtotal_centavos >= 0),
  discount_centavos bigint not null default 0 check (discount_centavos >= 0),
  total_centavos bigint not null check (total_centavos >= 0),
  promotion_id uuid references public.promotions (id) on delete set null,
  promo_code text,
  discount_label text,
  -- set by the admin when a formal quotation is issued
  quoted_total_centavos bigint check (quoted_total_centavos is null or quoted_total_centavos >= 0),
  deposit_due_centavos bigint check (deposit_due_centavos is null or deposit_due_centavos >= 0),
  amount_paid_centavos bigint not null default 0 check (amount_paid_centavos >= 0),
  deadline date,
  internal_notes text not null default '',
  source_ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_centavos <= subtotal_centavos),
  check (total_centavos = subtotal_centavos - discount_centavos)
);
create index orders_customer_idx on public.orders (customer_id);
create index orders_status_idx on public.orders (status);
create index orders_created_idx on public.orders (created_at desc);
create index orders_service_idx on public.orders (service_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  kind text not null check (kind in ('service', 'package', 'addon')),
  service_id uuid references public.services (id) on delete set null,
  package_id uuid references public.service_packages (id) on delete set null,
  addon_id uuid references public.service_addons (id) on delete set null,
  name text not null,
  unit_price_centavos bigint not null check (unit_price_centavos >= 0),
  quantity integer not null default 1 check (quantity > 0),
  total_centavos bigint not null check (total_centavos >= 0),
  created_at timestamptz not null default now(),
  check (total_centavos = unit_price_centavos * quantity)
);
create index order_items_order_idx on public.order_items (order_id);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status text,
  to_status text not null,
  note text not null default '',
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

-- Internal notes (is_public = false) and customer-visible updates (is_public = true)
create table public.order_updates (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  is_public boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_updates_order_idx on public.order_updates (order_id, created_at);

-- Expiring tracking links. Only the SHA-256 hash of the token is stored.
create table public.order_access_tokens (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_access_tokens_order_idx on public.order_access_tokens (order_id);

-- ───────────────────────── projects ─────────────────────────
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete restrict,
  name text not null,
  status text not null default 'planning' check (status in (
    'planning', 'in_progress', 'review', 'on_hold', 'completed', 'cancelled')),
  start_date date,
  deadline date,
  completed_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_customer_idx on public.projects (customer_id);
create index projects_deadline_idx on public.projects (deadline) where status not in ('completed', 'cancelled');

create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  completed_at timestamptz,
  is_public boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_milestones_project_idx on public.project_milestones (project_id, sort_order);

-- ───────────────────────── payments ─────────────────────────
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'custom' check (kind in ('gcash', 'maya', 'bank', 'custom')),
  account_holder text not null default '',
  account_number text not null default '',
  qr_image_url text,
  instructions text not null default '',
  is_active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_submissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  payment_method_id uuid references public.payment_methods (id) on delete set null,
  method_name text not null,
  payment_type text not null default 'deposit' check (payment_type in ('deposit', 'full', 'final', 'other')),
  amount_claimed_centavos bigint check (amount_claimed_centavos is null or amount_claimed_centavos > 0),
  transaction_reference text not null check (char_length(transaction_reference) between 1 and 120),
  proof_path text not null unique,
  proof_mime text not null check (proof_mime in ('image/jpeg', 'image/png', 'application/pdf')),
  proof_size integer not null check (proof_size > 0),
  status text not null default 'proof_submitted' check (status in (
    'proof_submitted', 'under_review', 'verified', 'rejected', 'refunded')),
  verified_amount_centavos bigint check (verified_amount_centavos is null or verified_amount_centavos > 0),
  review_note text not null default '',
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- a verified submission always carries the verified amount and the review time
  -- (reviewed_by may become null later if that admin account is deleted)
  constraint payment_submissions_verified_check
    check (status not in ('verified', 'refunded') or (reviewed_at is not null and verified_amount_centavos is not null))
);
create index payment_submissions_order_idx on public.payment_submissions (order_id);
create index payment_submissions_status_idx on public.payment_submissions (status);

-- Ledger of verified money movements. Rows are only written by admin_review_payment().
create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  submission_id uuid references public.payment_submissions (id) on delete set null,
  kind text not null check (kind in ('payment', 'refund')),
  amount_centavos bigint not null check (amount_centavos > 0),
  method_name text not null default '',
  transaction_reference text not null default '',
  note text not null default '',
  verified_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index payment_transactions_order_idx on public.payment_transactions (order_id);
create index payment_transactions_created_idx on public.payment_transactions (created_at);
create unique index payment_transactions_one_per_submission on public.payment_transactions (submission_id, kind);

create table public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  discount_centavos bigint not null check (discount_centavos >= 0),
  code_used text,
  created_at timestamptz not null default now()
);
create index promotion_redemptions_promo_idx on public.promotion_redemptions (promotion_id);
create index promotion_redemptions_customer_idx on public.promotion_redemptions (customer_id);

-- ───────────────────────── loyalty ─────────────────────────
create table public.loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.customers (id) on delete cascade,
  points_balance bigint not null default 0 check (points_balance >= 0),
  lifetime_points bigint not null default 0 check (lifetime_points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.loyalty_accounts (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  points bigint not null check (points <> 0),
  reason text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index loyalty_transactions_account_idx on public.loyalty_transactions (account_id, created_at);

-- ───────────────────────── documents ─────────────────────────
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  kind text not null check (kind in (
    'order_summary', 'quotation', 'contract', 'payment_acknowledgment', 'receipt', 'invoice')),
  number text not null unique,
  title text not null,
  storage_path text not null unique,
  amount_centavos bigint check (amount_centavos is null or amount_centavos >= 0),
  -- a ledger entry that has a receipt cannot be deleted
  payment_transaction_id uuid references public.payment_transactions (id) on delete restrict,
  is_customer_visible boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- an official receipt must always point at a verified ledger entry
  check (kind <> 'receipt' or payment_transaction_id is not null)
);
create index documents_order_idx on public.documents (order_id);
create index documents_kind_idx on public.documents (kind, created_at desc);

-- ───────────────────────── content ─────────────────────────
create table public.portfolio_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 160),
  category text not null default '',
  summary text not null default '',
  description text not null default '',
  image_url text,
  gallery jsonb not null default '[]'::jsonb check (jsonb_typeof(gallery) = 'array'),
  tech jsonb not null default '[]'::jsonb check (jsonb_typeof(tech) = 'array'),
  project_url text,
  client_name text,
  is_concept boolean not null default false,
  is_featured boolean not null default false,
  is_published boolean not null default true,
  completed_on date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'media',
  path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  kind text not null default 'image' check (kind in ('image', 'logo', 'qr', 'video', 'other')),
  alt_text text not null default '',
  public_url text,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, path)
);

-- Website builder storage. Draft and published content live side by side;
-- the public only ever receives "published" through get_published_site().
create table public.website_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null default '',
  draft_content jsonb not null default '{}'::jsonb,
  published_content jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A version is a full snapshot of the site (theme + settings + all pages) taken at publish time.
create table public.website_page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid references public.website_pages (id) on delete set null,
  version_number integer not null unique check (version_number > 0),
  label text not null default '',
  snapshot jsonb not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.theme_settings (
  id integer primary key default 1 check (id = 1),
  draft jsonb not null default '{}'::jsonb,
  published jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- key/value settings. Public keys: brand, navigation, footer, buttons, forms.
-- Private keys (never returned to the public): operations.
create table public.website_settings (
  key text primary key check (key ~ '^[a-z_]+$'),
  draft jsonb not null default '{}'::jsonb,
  published jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────── ops ─────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'new_order', 'payment_proof', 'payment_approved', 'payment_rejected',
    'project_deadline', 'customer_message', 'project_completed', 'system')),
  title text not null,
  body text not null default '',
  link text,
  order_id uuid references public.orders (id) on delete cascade,
  dedupe_key text unique,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_unread_idx on public.notifications (created_at desc) where not is_read;

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  email text not null,
  phone text not null default '',
  message text not null check (char_length(message) between 1 and 5000),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_email text,
  action text not null,
  entity_table text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_table, entity_id);

-- Per-scope, per-year gapless counters for references (DVM, QUO, CON, ACK, REC, INV).
create table public.counters (
  scope text not null,
  year integer not null,
  value bigint not null default 0,
  primary key (scope, year)
);

-- Fixed-window rate limiting used by the serverless functions.
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

-- ───────────────────────── updated_at triggers ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'admin_roles', 'customers', 'services', 'service_addons', 'service_packages',
    'promotions', 'orders', 'projects', 'project_milestones', 'payment_methods',
    'payment_submissions', 'loyalty_accounts', 'portfolio_projects', 'media_assets',
    'website_pages', 'theme_settings', 'website_settings']
  loop
    execute format('create trigger set_updated_at before update on public.%I
      for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 0002_functions.sql
-- ---------------------------------------------------------------------------
-- DevMart — business logic that must run on the server (inside Postgres).
-- All SECURITY DEFINER functions pin search_path and check authorisation themselves.

-- ───────────────────────── authorisation ─────────────────────────
-- An admin is a user that (1) is linked to an active admin_roles row and
-- (2) has completed multi-factor authentication in this session (aal2).
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
           select 1 from public.admin_roles r
           where r.user_id = (select auth.uid()) and r.is_active)
     and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;

-- Lets the signed-in user see whether they are allowlisted (before MFA is complete).
create or replace function public.admin_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'allowlisted', exists (select 1 from public.admin_roles r where r.user_id = (select auth.uid()) and r.is_active),
    'role', (select r.role from public.admin_roles r where r.user_id = (select auth.uid()) and r.is_active),
    'aal', coalesce((select auth.jwt()) ->> 'aal', 'aal1'),
    'is_admin', public.is_admin());
$$;

-- Create a profile for every auth user and link allowlisted, e-mail-confirmed users to their role.
create or replace function public.handle_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do update set email = excluded.email;

  if new.email_confirmed_at is not null then
    update public.admin_roles
       set user_id = new.id
     where email = lower(new.email) and user_id is null;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.handle_auth_user();

-- When an allowlist row is added for a user that already exists, link it immediately.
create or replace function public.link_admin_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is null then
    select u.id into new.user_id from auth.users u
     where lower(u.email) = new.email and u.email_confirmed_at is not null
     limit 1;
  end if;
  return new;
end $$;

create trigger link_admin_role before insert on public.admin_roles
  for each row execute function public.link_admin_role();

-- ───────────────────────── references ─────────────────────────
-- Returns e.g. DVM-2026-000001. Year follows Asia/Manila. Row lock makes it gapless & race-free.
create or replace function public.next_reference(p_scope text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_year integer := extract(year from (now() at time zone 'Asia/Manila'))::integer;
  v_value bigint;
begin
  insert into public.counters as c (scope, year, value) values (p_scope, v_year, 1)
  on conflict (scope, year) do update set value = c.value + 1
  returning c.value into v_value;
  return p_scope || '-' || v_year::text || '-' || lpad(v_value::text, 6, '0');
end $$;

-- ───────────────────────── settings helper ─────────────────────────
create or replace function public.op_setting_int(p_name text, p_default integer) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case when (published ->> p_name) ~ '^[0-9]{1,9}$' then (published ->> p_name)::integer end
       from public.website_settings where key = 'operations'),
    p_default);
$$;

-- ───────────────────────── audit trail ─────────────────────────
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  -- ignore bookkeeping-only updates
  if tg_op = 'UPDATE' and (v_old - 'updated_at' - 'usage_count') = (v_new - 'updated_at' - 'usage_count') then
    return new;
  end if;
  insert into public.audit_logs (actor_id, actor_email, action, entity_table, entity_id, old_data, new_data)
  values ((select auth.uid()), (select auth.jwt()) ->> 'email', lower(tg_op), tg_table_name,
          coalesce(v_new ->> 'id', v_old ->> 'id'), v_old, v_new);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'admin_roles', 'customers', 'services', 'service_addons', 'service_packages', 'promotions',
    'orders', 'projects', 'payment_methods', 'payment_submissions', 'payment_transactions',
    'documents', 'portfolio_projects', 'loyalty_transactions']
  loop
    execute format('create trigger audit_row after insert or update or delete on public.%I
      for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- ───────────────────────── order lifecycle ─────────────────────────
create or replace function public.orders_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.order_status_history (order_id, from_status, to_status, note, changed_by)
  values (new.id, null, new.status, 'Order submitted', (select auth.uid()));

  insert into public.notifications (type, title, body, link, order_id)
  values ('new_order', 'New order ' || new.reference,
          new.customer_name || ' requested "' || new.project_name || '".',
          '/admin/orders/' || new.id::text, new.id);
  return new;
end $$;

create trigger orders_after_insert after insert on public.orders
  for each row execute function public.orders_after_insert();

create or replace function public.orders_after_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_project_id uuid;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_referrer uuid;
  v_account uuid;
  v_bonus integer;
begin
  if new.deadline is distinct from old.deadline then
    update public.projects set deadline = new.deadline where order_id = new.id;
  end if;

  if new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status, note, changed_by)
    values (new.id, old.status, new.status,
            coalesce(nullif(current_setting('app.status_note', true), ''), ''), (select auth.uid()));

    if new.status = 'in_development' then
      insert into public.projects (order_id, customer_id, name, status, start_date, deadline)
      values (new.id, new.customer_id, new.project_name, 'in_progress', v_today,
              coalesce(new.deadline, new.target_deadline))
      on conflict (order_id) do update set status = 'in_progress'
        where public.projects.status in ('planning', 'on_hold', 'review')
      returning id into v_project_id;

      if v_project_id is not null
         and not exists (select 1 from public.project_milestones where project_id = v_project_id) then
        insert into public.project_milestones (project_id, title, sort_order) values
          (v_project_id, 'Requirements & planning', 1),
          (v_project_id, 'Design', 2),
          (v_project_id, 'Development', 3),
          (v_project_id, 'Testing & revisions', 4),
          (v_project_id, 'Launch & handover', 5);
      end if;

    elsif new.status = 'revision' then
      update public.projects set status = 'review' where order_id = new.id and status <> 'completed';

    elsif new.status = 'completed' then
      update public.projects set status = 'completed', completed_at = now() where order_id = new.id;
      insert into public.notifications (type, title, body, link, order_id)
      values ('project_completed', 'Project completed: ' || new.reference,
              '"' || new.project_name || '" was marked as completed.',
              '/admin/orders/' || new.id::text, new.id);

      -- referral bonus: first completed order of a referred customer rewards the referrer
      select c.referred_by into v_referrer from public.customers c where c.id = new.customer_id;
      if v_referrer is not null and not exists (
           select 1 from public.orders o
            where o.customer_id = new.customer_id and o.status = 'completed' and o.id <> new.id) then
        v_bonus := public.op_setting_int('referral_bonus_points', 50);
        if v_bonus > 0 then
          insert into public.loyalty_accounts (customer_id) values (v_referrer)
          on conflict (customer_id) do nothing;
          update public.loyalty_accounts
             set points_balance = points_balance + v_bonus, lifetime_points = lifetime_points + v_bonus
           where customer_id = v_referrer returning id into v_account;
          insert into public.loyalty_transactions (account_id, order_id, points, reason, created_by)
          values (v_account, new.id, v_bonus, 'Referral bonus for ' || new.reference, (select auth.uid()));
        end if;
      end if;

    elsif new.status = 'cancelled' then
      update public.projects set status = 'cancelled' where order_id = new.id and status <> 'completed';
    end if;
  end if;
  return new;
end $$;

create trigger orders_after_update after update on public.orders
  for each row execute function public.orders_after_update();

-- Admin status change with an optional note that lands in the history row.
create or replace function public.admin_set_order_status(p_order_id uuid, p_status text, p_note text default '')
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  perform set_config('app.status_note', left(coalesce(p_note, ''), 1000), true);
  update public.orders set status = p_status where id = p_order_id returning * into v_order;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  perform set_config('app.status_note', '', true);
  return v_order;
end $$;

-- ───────────────────────── order creation (service role only) ─────────────────────────
-- Called by the order-create serverless function AFTER it has validated the input and
-- computed every price from the catalogue. Runs as one transaction.
create or replace function public.create_order_tx(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_customer_id uuid;
  v_is_new boolean;
  v_order_id uuid;
  v_reference text;
  v_promo public.promotions;
  v_promo_id uuid := nullif(p ->> 'promotion_id', '')::uuid;
  v_referrer uuid := nullif(p ->> 'referrer_customer_id', '')::uuid;
  v_email text := lower(trim(p #>> '{customer,email}'));
  v_subtotal bigint := (p ->> 'subtotal_centavos')::bigint;
  v_discount bigint := coalesce((p ->> 'discount_centavos')::bigint, 0);
  v_item jsonb;
  v_items_total bigint := 0;
begin
  if jsonb_array_length(coalesce(p -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'NO_ITEMS' using errcode = 'P0001';
  end if;
  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'INVALID_DISCOUNT' using errcode = 'P0001';
  end if;

  -- customer upsert (keyed by e-mail)
  insert into public.customers as c (full_name, email, phone, facebook_contact, referral_code)
  values (trim(p #>> '{customer,full_name}'), v_email, trim(p #>> '{customer,phone}'),
          trim(p #>> '{customer,facebook}'),
          upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)))
  on conflict (email) do update
     set full_name = excluded.full_name, phone = excluded.phone, facebook_contact = excluded.facebook_contact
  returning c.id, (c.xmax = 0) into v_customer_id, v_is_new;

  if v_is_new and v_referrer is not null and v_referrer <> v_customer_id then
    update public.customers set referred_by = v_referrer where id = v_customer_id;
  end if;

  insert into public.loyalty_accounts (customer_id) values (v_customer_id)
  on conflict (customer_id) do nothing;

  -- promotion: lock, re-validate limits, count the redemption
  if v_promo_id is not null then
    select * into v_promo from public.promotions where id = v_promo_id for update;
    if not found or not v_promo.is_active
       or (v_promo.starts_at is not null and v_promo.starts_at > now())
       or (v_promo.expires_at is not null and v_promo.expires_at <= now())
       or (v_promo.usage_limit is not null and v_promo.usage_count >= v_promo.usage_limit)
       or (v_promo.per_customer_limit is not null and (
             select count(*) from public.promotion_redemptions r
              where r.promotion_id = v_promo_id and r.customer_id = v_customer_id) >= v_promo.per_customer_limit)
    then
      raise exception 'PROMO_UNAVAILABLE' using errcode = 'P0001';
    end if;
    update public.promotions set usage_count = usage_count + 1 where id = v_promo_id;
  elsif v_discount > 0 then
    raise exception 'INVALID_DISCOUNT' using errcode = 'P0001';
  end if;

  v_reference := public.next_reference('DVM');

  insert into public.orders (
    reference, customer_id, service_id, project_name, project_description, requested_features,
    preferred_design, reference_websites, target_deadline, budget_range, additional_notes,
    customer_name, customer_email, customer_phone, customer_facebook, privacy_consent_at,
    subtotal_centavos, discount_centavos, total_centavos, promotion_id, promo_code, discount_label,
    source_ip_hash)
  values (
    v_reference, v_customer_id, nullif(p ->> 'service_id', '')::uuid,
    trim(p #>> '{project,name}'), coalesce(p #>> '{project,description}', ''),
    coalesce(p #>> '{project,features}', ''), coalesce(p #>> '{project,preferred_design}', ''),
    coalesce(p #>> '{project,reference_websites}', ''), nullif(p #>> '{project,target_deadline}', '')::date,
    coalesce(p #>> '{project,budget_range}', ''), coalesce(p #>> '{project,additional_notes}', ''),
    trim(p #>> '{customer,full_name}'), v_email, trim(p #>> '{customer,phone}'),
    trim(p #>> '{customer,facebook}'), now(),
    v_subtotal, v_discount, v_subtotal - v_discount, v_promo_id,
    nullif(p ->> 'promo_code', ''), nullif(p ->> 'discount_label', ''), nullif(p ->> 'ip_hash', ''))
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    insert into public.order_items (order_id, kind, service_id, package_id, addon_id, name,
                                    unit_price_centavos, quantity, total_centavos)
    values (v_order_id, v_item ->> 'kind',
            nullif(v_item ->> 'service_id', '')::uuid, nullif(v_item ->> 'package_id', '')::uuid,
            nullif(v_item ->> 'addon_id', '')::uuid, v_item ->> 'name',
            (v_item ->> 'unit_price_centavos')::bigint, coalesce((v_item ->> 'quantity')::integer, 1),
            (v_item ->> 'unit_price_centavos')::bigint * coalesce((v_item ->> 'quantity')::integer, 1));
    v_items_total := v_items_total
      + (v_item ->> 'unit_price_centavos')::bigint * coalesce((v_item ->> 'quantity')::integer, 1);
  end loop;

  if v_items_total <> v_subtotal then
    raise exception 'SUBTOTAL_MISMATCH' using errcode = 'P0001';
  end if;

  if v_promo_id is not null then
    insert into public.promotion_redemptions (promotion_id, order_id, customer_id, discount_centavos, code_used)
    values (v_promo_id, v_order_id, v_customer_id, v_discount, nullif(p ->> 'promo_code', ''));
  end if;

  insert into public.order_access_tokens (order_id, token_hash, expires_at)
  values (v_order_id, p ->> 'token_hash', (p ->> 'token_expires_at')::timestamptz);

  return jsonb_build_object('order_id', v_order_id, 'reference', v_reference,
                            'customer_id', v_customer_id, 'is_new_customer', v_is_new);
end $$;

-- Admin: issue a fresh expiring tracking link token for an order. The raw token is
-- returned exactly once; only its hash is stored.
create or replace function public.admin_issue_tracking_token(p_order_id uuid, p_days integer default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_days integer := least(greatest(coalesce(p_days, public.op_setting_int('tracking_link_days', 30)), 1), 365);
  v_expires timestamptz := now() + make_interval(days => v_days);
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.order_access_tokens (order_id, token_hash, expires_at, created_by)
  values (p_order_id, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_expires, (select auth.uid()));
  return jsonb_build_object('token', v_token, 'expires_at', v_expires);
end $$;

create or replace function public.admin_revoke_tracking_tokens(p_order_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.order_access_tokens set revoked_at = now()
   where order_id = p_order_id and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ───────────────────────── payments ─────────────────────────
-- A new proof never verifies anything: it only flags the order for manual review.
create or replace function public.payment_submissions_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  update public.orders
     set payment_status = case when payment_status in ('verified') and amount_paid_centavos > 0
                               then payment_status else 'proof_submitted' end,
         status = case when status = 'awaiting_deposit' then 'payment_under_review' else status end
   where id = new.order_id
  returning * into v_order;

  insert into public.notifications (type, title, body, link, order_id)
  values ('payment_proof', 'Payment proof for ' || v_order.reference,
          v_order.customer_name || ' submitted a ' || new.method_name || ' payment proof (ref ' ||
          new.transaction_reference || ').',
          '/admin/payments', new.order_id);
  return new;
end $$;

create trigger payment_submissions_after_insert after insert on public.payment_submissions
  for each row execute function public.payment_submissions_after_insert();

-- The ONLY way a payment becomes verified / rejected / refunded.
create or replace function public.admin_review_payment(
  p_submission_id uuid, p_decision text, p_amount_centavos bigint default null, p_note text default '')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub public.payment_submissions;
  v_order public.orders;
  v_txn_id uuid;
  v_points bigint;
  v_account uuid;
  v_uid uuid := (select auth.uid());
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_decision not in ('under_review', 'verified', 'rejected', 'refunded') then
    raise exception 'INVALID_DECISION' using errcode = 'P0001';
  end if;

  select * into v_sub from public.payment_submissions where id = p_submission_id for update;
  if not found then raise exception 'SUBMISSION_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into v_order from public.orders where id = v_sub.order_id for update;

  if not ((v_sub.status = 'proof_submitted' and p_decision in ('under_review', 'verified', 'rejected'))
       or (v_sub.status = 'under_review' and p_decision in ('verified', 'rejected'))
       or (v_sub.status = 'verified' and p_decision = 'refunded')) then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  if p_decision = 'under_review' then
    update public.payment_submissions
       set status = 'under_review', review_note = coalesce(p_note, ''), reviewed_by = v_uid, reviewed_at = now()
     where id = p_submission_id;
    update public.orders set payment_status = 'under_review'
     where id = v_order.id and payment_status in ('awaiting_payment', 'proof_submitted', 'rejected');

  elsif p_decision = 'verified' then
    if p_amount_centavos is null or p_amount_centavos <= 0 then
      raise exception 'AMOUNT_REQUIRED' using errcode = 'P0001';
    end if;
    update public.payment_submissions
       set status = 'verified', verified_amount_centavos = p_amount_centavos,
           review_note = coalesce(p_note, ''), reviewed_by = v_uid, reviewed_at = now()
     where id = p_submission_id;

    insert into public.payment_transactions (order_id, submission_id, kind, amount_centavos, method_name,
                                             transaction_reference, note, verified_by)
    values (v_order.id, p_submission_id, 'payment', p_amount_centavos, v_sub.method_name,
            v_sub.transaction_reference, coalesce(p_note, ''), v_uid)
    returning id into v_txn_id;

    perform set_config('app.status_note', 'Payment verified', true);
    update public.orders
       set amount_paid_centavos = amount_paid_centavos + p_amount_centavos,
           payment_status = 'verified',
           status = case when status in ('pending_review', 'contacted', 'quotation_sent', 'awaiting_approval',
                                         'awaiting_deposit', 'payment_under_review')
                         then 'payment_verified' else status end
     where id = v_order.id;
    perform set_config('app.status_note', '', true);

    -- loyalty: N points per ₱100 verified
    v_points := (p_amount_centavos / 10000) * public.op_setting_int('points_per_100_pesos', 1);
    if v_points > 0 then
      insert into public.loyalty_accounts (customer_id) values (v_order.customer_id)
      on conflict (customer_id) do nothing;
      update public.loyalty_accounts
         set points_balance = points_balance + v_points, lifetime_points = lifetime_points + v_points
       where customer_id = v_order.customer_id returning id into v_account;
      insert into public.loyalty_transactions (account_id, order_id, points, reason, created_by)
      values (v_account, v_order.id, v_points, 'Verified payment for ' || v_order.reference, v_uid);
    end if;

    insert into public.notifications (type, title, body, link, order_id)
    values ('payment_approved', 'Payment verified for ' || v_order.reference,
            'Verified ₱' || to_char(p_amount_centavos / 100.0, 'FM999,999,999,990.00') || ' via ' || v_sub.method_name || '.',
            '/admin/orders/' || v_order.id::text, v_order.id);

  elsif p_decision = 'rejected' then
    update public.payment_submissions
       set status = 'rejected', review_note = coalesce(p_note, ''), reviewed_by = v_uid, reviewed_at = now()
     where id = p_submission_id;
    perform set_config('app.status_note', 'Payment proof rejected', true);
    update public.orders
       set payment_status = case when amount_paid_centavos > 0 then 'verified' else 'rejected' end,
           status = case when status = 'payment_under_review' then 'awaiting_deposit' else status end
     where id = v_order.id;
    perform set_config('app.status_note', '', true);
    insert into public.notifications (type, title, body, link, order_id)
    values ('payment_rejected', 'Payment rejected for ' || v_order.reference,
            coalesce(nullif(p_note, ''), 'The payment proof was rejected.'),
            '/admin/orders/' || v_order.id::text, v_order.id);

  else -- refunded
    update public.payment_submissions
       set status = 'refunded', review_note = coalesce(p_note, ''), reviewed_by = v_uid, reviewed_at = now()
     where id = p_submission_id;
    insert into public.payment_transactions (order_id, submission_id, kind, amount_centavos, method_name,
                                             transaction_reference, note, verified_by)
    values (v_order.id, p_submission_id, 'refund', v_sub.verified_amount_centavos, v_sub.method_name,
            v_sub.transaction_reference, coalesce(p_note, ''), v_uid)
    returning id into v_txn_id;
    update public.orders
       set amount_paid_centavos = greatest(amount_paid_centavos - v_sub.verified_amount_centavos, 0),
           payment_status = case when amount_paid_centavos - v_sub.verified_amount_centavos > 0
                                 then 'verified' else 'refunded' end
     where id = v_order.id;
  end if;

  return jsonb_build_object('submission_id', p_submission_id, 'status', p_decision,
                            'transaction_id', v_txn_id, 'order_id', v_order.id);
end $$;

-- Manual loyalty adjustment by an admin (never drives balance below zero).
create or replace function public.admin_adjust_loyalty(p_customer_id uuid, p_points bigint, p_reason text)
returns public.loyalty_accounts
language plpgsql security definer set search_path = '' as $$
declare v_acc public.loyalty_accounts;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_points = 0 then raise exception 'INVALID_POINTS' using errcode = 'P0001'; end if;
  insert into public.loyalty_accounts (customer_id) values (p_customer_id)
  on conflict (customer_id) do nothing;
  update public.loyalty_accounts
     set points_balance = points_balance + p_points,
         lifetime_points = lifetime_points + greatest(p_points, 0)
   where customer_id = p_customer_id
  returning * into v_acc;
  insert into public.loyalty_transactions (account_id, points, reason, created_by)
  values (v_acc.id, p_points, coalesce(nullif(p_reason, ''), 'Manual adjustment'), (select auth.uid()));
  return v_acc;
end $$;

-- ───────────────────────── website builder ─────────────────────────
create or replace function public.site_doc(p_published boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select
    coalesce((
      select jsonb_object_agg(s.key, case when p_published then s.published else s.draft end)
        from public.website_settings s
       where s.key in ('brand', 'navigation', 'footer', 'buttons', 'forms')
         and (not p_published or s.published is not null)), '{}'::jsonb)
    || jsonb_build_object(
      'theme', (select case when p_published then t.published else t.draft end
                  from public.theme_settings t where t.id = 1),
      'pages', coalesce((
        select jsonb_object_agg(w.slug, case when p_published then w.published_content else w.draft_content end)
          from public.website_pages w
         where (not p_published or w.published_content is not null)), '{}'::jsonb));
$$;

-- Public: published content only.
create or replace function public.get_published_site() returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.site_doc(true);
$$;

create or replace function public.get_site_draft() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return public.site_doc(false);
end $$;

create or replace function public.save_site_draft(p_doc jsonb) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  k text;
  v_slug text;
  v_content jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if jsonb_typeof(p_doc) <> 'object' or octet_length(p_doc::text) > 2000000 then
    raise exception 'INVALID_DOCUMENT' using errcode = 'P0001';
  end if;

  insert into public.theme_settings as t (id, draft) values (1, coalesce(p_doc -> 'theme', '{}'::jsonb))
  on conflict (id) do update set draft = excluded.draft;

  foreach k in array array['brand', 'navigation', 'footer', 'buttons', 'forms'] loop
    if p_doc ? k then
      insert into public.website_settings as s (key, draft) values (k, p_doc -> k)
      on conflict (key) do update set draft = excluded.draft;
    end if;
  end loop;

  for v_slug, v_content in select * from jsonb_each(coalesce(p_doc -> 'pages', '{}'::jsonb)) loop
    if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or jsonb_typeof(v_content) <> 'object' then
      raise exception 'INVALID_PAGE' using errcode = 'P0001';
    end if;
    insert into public.website_pages as w (slug, title, draft_content)
    values (v_slug, coalesce(v_content ->> 'title', ''), v_content)
    on conflict (slug) do update set draft_content = excluded.draft_content, title = excluded.title;
  end loop;
  return now();
end $$;

create or replace function public.publish_site(p_label text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_version integer;
  v_id uuid;
  v_doc jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  -- serialise concurrent publishes
  perform 1 from public.theme_settings where id = 1 for update;

  update public.theme_settings set published = draft where id = 1;
  update public.website_settings set published = draft
   where key in ('brand', 'navigation', 'footer', 'buttons', 'forms');
  -- (Supabase's API roles reject UPDATE without WHERE, hence the explicit predicate)
  update public.website_pages set published_content = draft_content, published_at = now() where slug is not null;

  v_doc := public.site_doc(false);
  select coalesce(max(version_number), 0) + 1 into v_version from public.website_page_versions;
  insert into public.website_page_versions (version_number, label, snapshot, created_by)
  values (v_version, left(coalesce(p_label, ''), 200), v_doc, (select auth.uid()))
  returning id into v_id;

  insert into public.audit_logs (actor_id, actor_email, action, entity_table, entity_id, new_data)
  values ((select auth.uid()), (select auth.jwt()) ->> 'email', 'publish', 'website', v_id::text,
          jsonb_build_object('version_number', v_version, 'label', p_label));

  return jsonb_build_object('id', v_id, 'version_number', v_version, 'published_at', now());
end $$;

-- Loads an older snapshot back into the DRAFT. Nothing goes public until publish_site().
create or replace function public.restore_site_version(p_version_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.website_page_versions;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v from public.website_page_versions where id = p_version_id;
  if not found then raise exception 'VERSION_NOT_FOUND' using errcode = 'P0002'; end if;
  perform public.save_site_draft(v.snapshot);
  insert into public.audit_logs (actor_id, actor_email, action, entity_table, entity_id, new_data)
  values ((select auth.uid()), (select auth.jwt()) ->> 'email', 'restore', 'website', v.id::text,
          jsonb_build_object('version_number', v.version_number));
  return v.snapshot;
end $$;

-- ───────────────────────── rate limiting (service role) ─────────────────────────
create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.rate_limits as r (key, window_start, count) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_count <= p_max;
end $$;

-- ───────────────────────── notifications ─────────────────────────
-- Creates (once) a notification for every open project / milestone due within p_days.
create or replace function public.generate_deadline_notifications(p_days integer default 3) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_count integer := 0;
  v_rows integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  insert into public.notifications (type, title, body, link, order_id, dedupe_key)
  select 'project_deadline',
         case when p.deadline < v_today then 'Overdue: ' else 'Deadline soon: ' end || p.name,
         'Project deadline is ' || to_char(p.deadline, 'Mon DD, YYYY') || '.',
         '/admin/projects', p.order_id, 'project:' || p.id || ':' || p.deadline
    from public.projects p
   where p.status not in ('completed', 'cancelled') and p.deadline is not null
     and p.deadline <= v_today + p_days
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  insert into public.notifications (type, title, body, link, order_id, dedupe_key)
  select 'project_deadline',
         case when m.due_date < v_today then 'Overdue milestone: ' else 'Milestone due soon: ' end || m.title,
         p.name || ' — due ' || to_char(m.due_date, 'Mon DD, YYYY') || '.',
         '/admin/projects', p.order_id, 'milestone:' || m.id || ':' || m.due_date
    from public.project_milestones m join public.projects p on p.id = m.project_id
   where m.status <> 'done' and m.due_date is not null and m.due_date <= v_today + p_days
     and p.status not in ('completed', 'cancelled')
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  return v_count;
end $$;

create or replace function public.contact_messages_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (type, title, body, link)
  values ('customer_message', 'New message from ' || new.name, left(new.message, 280), '/admin/notifications');
  return new;
end $$;

create trigger contact_messages_after_insert after insert on public.contact_messages
  for each row execute function public.contact_messages_after_insert();

-- ───────────────────────── analytics ─────────────────────────
-- Every number comes from real rows. Empty database → zeros.
create or replace function public.analytics_summary(
  p_from timestamptz, p_to timestamptz, p_service_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  with o as (
    select * from public.orders
     where created_at >= p_from and created_at < p_to
       and (p_service_id is null or service_id = p_service_id)
  ),
  tx as (
    select t.* from public.payment_transactions t
      join public.orders ord on ord.id = t.order_id
     where t.created_at >= p_from and t.created_at < p_to
       and (p_service_id is null or ord.service_id = p_service_id)
  ),
  months as (
    select generate_series(
      date_trunc('month', p_from at time zone 'Asia/Manila'),
      date_trunc('month', (p_to - interval '1 second') at time zone 'Asia/Manila'),
      interval '1 month') as m
  )
  select jsonb_build_object(
    'total_inquiries', (select count(*) from o),
    'pending_orders', (select count(*) from o where status in (
        'pending_review', 'contacted', 'quotation_sent', 'awaiting_approval', 'awaiting_deposit', 'payment_under_review')),
    'active_projects', (select count(*) from o where status in (
        'payment_verified', 'in_development', 'revision', 'awaiting_final_payment')),
    'completed_projects', (select count(*) from o where status = 'completed'),
    'cancelled_orders', (select count(*) from o where status = 'cancelled'),
    'converted_orders', (select count(*) from o where amount_paid_centavos > 0 or status in (
        'payment_verified', 'in_development', 'revision', 'awaiting_final_payment', 'completed')),
    'verified_revenue_centavos', (select coalesce(sum(case kind when 'payment' then amount_centavos else -amount_centavos end), 0) from tx),
    'outstanding_centavos', (select coalesce(sum(greatest(coalesce(quoted_total_centavos, total_centavos) - amount_paid_centavos, 0)), 0)
                               from o where status <> 'cancelled'),
    'discount_total_centavos', (select coalesce(sum(discount_centavos), 0) from o),
    'discounted_orders', (select count(*) from o where discount_centavos > 0),
    'status_breakdown', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                           from (select status, count(*) n from o group by status) s),
    'popular_services', (select coalesce(jsonb_agg(row_to_json(x) order by x.orders desc, x.name), '[]'::jsonb) from (
        select max(i.name) as name, count(distinct i.order_id) as orders, sum(o.total_centavos) as value_centavos
          from public.order_items i join o on o.id = i.order_id
         where i.kind in ('service', 'package')
         group by coalesce(i.service_id::text, i.name)) x),
    'discounts', (select coalesce(jsonb_agg(row_to_json(d) order by d.uses desc), '[]'::jsonb) from (
        select coalesce(o.discount_label, 'Discount') as name, count(*) as uses, sum(o.discount_centavos) as amount_centavos
          from o where o.discount_centavos > 0 group by coalesce(o.discount_label, 'Discount')) d),
    'monthly', (select coalesce(jsonb_agg(row_to_json(mm) order by mm.month), '[]'::jsonb) from (
        select to_char(months.m, 'YYYY-MM') as month,
               (select count(*) from o where date_trunc('month', o.created_at at time zone 'Asia/Manila') = months.m) as orders,
               (select coalesce(sum(case kind when 'payment' then amount_centavos else -amount_centavos end), 0)
                  from tx where date_trunc('month', tx.created_at at time zone 'Asia/Manila') = months.m) as revenue_centavos
          from months) mm)
  ) into v;
  return v;
end $$;

-- ───────────────────────── public promo display ─────────────────────────
-- Only promotions the admin explicitly chose to advertise, with display-safe columns.
create or replace view public.public_promotions as
  select id, name, description, kind, code, discount_type, percent_bps, fixed_centavos,
         min_subtotal_centavos, service_ids, expires_at
    from public.promotions
   where is_active and show_on_site
     and (starts_at is null or starts_at <= now())
     and (expires_at is null or expires_at > now())
     and (usage_limit is null or usage_count < usage_limit);

-- ---------------------------------------------------------------------------
-- 0003_security.sql
-- ---------------------------------------------------------------------------
-- DevMart — Row Level Security, grants, storage.
-- Model:
--   anon / authenticated (non-admin): read the public catalogue only.
--   admin (allowlisted + MFA): manage everything through RLS; sensitive state changes
--     (payment verification, ledger, site publishing, order pricing) only through RPCs.
--   service_role (serverless functions only): bypasses RLS.

-- ───────────────────────── enable RLS everywhere ─────────────────────────
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ───────────────────────── reset privileges ─────────────────────────
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- public catalogue (rows further limited by policies below)
grant select on public.services, public.service_addons, public.service_packages,
                public.payment_methods, public.portfolio_projects, public.public_promotions
  to anon, authenticated;

-- admin-managed tables: full CRUD (RLS limits it to admins)
grant select, insert, update, delete on
  public.customers, public.services, public.service_addons, public.service_packages,
  public.promotions, public.projects, public.project_milestones, public.payment_methods,
  public.portfolio_projects, public.media_assets, public.notifications, public.contact_messages,
  public.order_updates, public.admin_roles, public.documents
  to authenticated;

-- orders: admins may read/delete, and update ONLY workflow columns. Pricing snapshot,
-- amount paid and payment status can never be edited from a browser session.
grant select, delete on public.orders to authenticated;
grant update (status, internal_notes, deadline, quoted_total_centavos, deposit_due_centavos,
              project_name, project_description, requested_features, preferred_design,
              reference_websites, target_deadline, budget_range, additional_notes)
  on public.orders to authenticated;

-- read-only for admins; rows are written by triggers / RPCs
grant select on public.order_items, public.order_status_history, public.payment_submissions,
                public.payment_transactions, public.promotion_redemptions, public.loyalty_accounts,
                public.loyalty_transactions, public.audit_logs, public.website_page_versions,
                public.website_pages, public.theme_settings
  to authenticated;
grant select, insert, update on public.website_settings to authenticated;
grant select, update on public.profiles to authenticated;
-- no grants at all: counters, rate_limits, order_access_tokens (service role / RPC only)

-- RPCs
grant execute on function public.get_published_site() to anon, authenticated;
grant execute on function
  public.is_admin(), public.admin_status(), public.get_site_draft(), public.save_site_draft(jsonb),
  public.publish_site(text), public.restore_site_version(uuid),
  public.admin_review_payment(uuid, text, bigint, text),
  public.admin_set_order_status(uuid, text, text),
  public.admin_issue_tracking_token(uuid, integer), public.admin_revoke_tracking_tokens(uuid),
  public.admin_adjust_loyalty(uuid, bigint, text),
  public.generate_deadline_notifications(integer),
  public.analytics_summary(timestamptz, timestamptz, uuid)
  to authenticated;

-- ───────────────────────── policies ─────────────────────────
-- public read
create policy "public reads active services" on public.services
  for select to anon, authenticated using (is_active and not is_archived);
create policy "public reads active addons" on public.service_addons
  for select to anon, authenticated using (
    is_active and (service_id is null or exists (
      select 1 from public.services s where s.id = service_id and s.is_active and not s.is_archived)));
create policy "public reads active packages" on public.service_packages
  for select to anon, authenticated using (
    is_active and exists (
      select 1 from public.services s where s.id = service_id and s.is_active and not s.is_archived));
create policy "public reads active payment methods" on public.payment_methods
  for select to anon, authenticated using (is_active);
create policy "public reads published portfolio" on public.portfolio_projects
  for select to anon, authenticated using (is_published);

-- own profile
create policy "user reads own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "user updates own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- admin: everything that was granted above
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'admin_roles', 'customers', 'services', 'service_addons', 'service_packages',
    'promotions', 'orders', 'order_items', 'order_status_history', 'order_updates', 'projects',
    'project_milestones', 'payment_methods', 'payment_submissions', 'payment_transactions',
    'promotion_redemptions', 'loyalty_accounts', 'loyalty_transactions', 'documents',
    'portfolio_projects', 'media_assets', 'website_pages', 'website_page_versions',
    'theme_settings', 'website_settings', 'notifications', 'contact_messages']
  loop
    execute format('create policy "admin manages %1$s" on public.%1$I
      for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
  end loop;
end $$;

-- audit log is append-only: admins can read, nobody can change it through the API
create policy "admin reads audit logs" on public.audit_logs
  for select to authenticated using ((select public.is_admin()));

-- an owner cannot be locked out by accident: the last active owner row cannot be removed/disabled
create or replace function public.protect_last_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'DELETE' or new.is_active = false or new.role <> 'owner')
     and old.role = 'owner' and old.is_active
     and not exists (select 1 from public.admin_roles
                      where role = 'owner' and is_active and id <> old.id) then
    raise exception 'LAST_OWNER' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.protect_last_owner() from public, anon, authenticated;

create trigger protect_last_owner before update or delete on public.admin_roles
  for each row execute function public.protect_last_owner();

-- the public view must run with the owner's rights (promotions table itself stays private)
alter view public.public_promotions set (security_invoker = false);

-- ───────────────────────── storage ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('media', 'media', true, 52428800,
     array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/x-icon',
           'image/vnd.microsoft.icon', 'video/mp4', 'video/webm']),
  ('payment-proofs', 'payment-proofs', false, 5242880,
     array['image/jpeg', 'image/png', 'application/pdf']),
  ('documents', 'documents', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- media: world-readable through the public bucket URL; only admins can write.
-- payment-proofs / documents: private. Admins read through signed URLs; customers only
-- ever receive short-lived signed URLs minted by the serverless functions.
create policy "admin manages devmart objects" on storage.objects
  for all to authenticated
  using (bucket_id in ('media', 'payment-proofs', 'documents') and (select public.is_admin()))
  with check (bucket_id in ('media', 'payment-proofs', 'documents') and (select public.is_admin()));

-- ───────────────────────── realtime (optional) ─────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 0004_seed.sql
-- ---------------------------------------------------------------------------
-- DevMart — initial catalogue. Safe to re-run (idempotent on slug / name).
-- No customers, orders, revenue or testimonials are seeded: analytics start at zero.

insert into public.services (slug, name, short_description, description, features, icon,
                             starting_price_centavos, delivery_days_min, delivery_days_max, sort_order)
values
  ('personal-website', 'Personal Website',
   'A polished personal site, portfolio or online résumé.',
   'A fast, mobile-friendly personal website that introduces you professionally — ideal for freelancers, creatives, students and job seekers.',
   '["Up to 5 pages", "Mobile-first responsive design", "Contact form", "Basic SEO setup", "Social media links"]',
   'User', 500000, 5, 10, 1),
  ('business-website', 'Business Website',
   'A credible online home for your business.',
   'A professional company website with your services, gallery, location and inquiry forms so customers can find and trust your business.',
   '["Up to 8 pages", "Services & gallery sections", "Inquiry form with notifications", "Google Maps & business details", "SEO-ready structure"]',
   'Building2', 600000, 7, 14, 2),
  ('smart-ordering-system', 'Smart Ordering System',
   'Let customers order online, any time.',
   'An online ordering website for food, retail and service businesses with a product menu, cart, order management and status updates.',
   '["Product / menu catalogue", "Cart & checkout flow", "Order dashboard", "Order status updates", "Manual payment support (GCash, Maya, bank)"]',
   'ShoppingBag', 800000, 10, 21, 3),
  ('booking-system', 'Booking System',
   'Appointments and reservations without the back-and-forth.',
   'A booking platform for clinics, salons, resorts, rentals and studios with schedules, availability and an admin calendar.',
   '["Online booking calendar", "Availability & schedule rules", "Booking management dashboard", "Customer confirmations", "Manual payment support"]',
   'CalendarCheck', 1000000, 14, 28, 4),
  ('android-application', 'Android Application',
   'A custom Android app for your idea or business.',
   'A custom Android application designed around your workflow — from business tools to customer-facing apps — delivered ready to install.',
   '["Custom UI design", "Up to 8 core screens", "Online database", "User accounts", "APK / Play Store-ready build"]',
   'Smartphone', 1200000, 21, 35, 5),
  ('ios-android-application', 'iOS + Android Application',
   'One app, both platforms.',
   'A cross-platform mobile app for iPhone and Android built from a single codebase, so your customers get the same experience everywhere.',
   '["iOS and Android builds", "Custom UI design", "Up to 10 core screens", "User accounts & online database", "Store submission guidance"]',
   'TabletSmartphone', 1800000, 28, 45, 6)
on conflict (slug) do nothing;

insert into public.service_addons (service_id, name, description, price_centavos, sort_order)
select null, v.name, v.description, v.price, v.sort_order
from (values
  ('Domain & hosting setup', 'We register and connect your domain and hosting (provider fees not included).', 100000, 1),
  ('Logo design', 'A simple, modern logo with web-ready exports.', 150000, 2),
  ('Admin dashboard', 'A private dashboard to manage your content or records yourself.', 300000, 3),
  ('Online payment instructions page', 'GCash / Maya / bank instructions with payment proof upload.', 200000, 4),
  ('SEO starter setup', 'Search-friendly titles, descriptions, sitemap and Google Search Console setup.', 150000, 5),
  ('3 months maintenance', 'Content updates, fixes and monitoring for three months after launch.', 250000, 6)
) as v(name, description, price, sort_order)
where not exists (select 1 from public.service_addons a where a.name = v.name and a.service_id is null);

-- Payment methods start DISABLED and empty. Fill in your real account details in
-- Admin → Payments, then enable them.
insert into public.payment_methods (name, kind, instructions, is_active, sort_order)
select v.name, v.kind, v.instructions, false, v.sort_order
from (values
  ('GCash', 'gcash', 'Open GCash → Send Money, or scan the QR code. Enter the exact amount, then save a screenshot of the receipt.', 1),
  ('Maya', 'maya', 'Open Maya → Send Money, or scan the QR code. Enter the exact amount, then save a screenshot of the receipt.', 2),
  ('Bank Transfer', 'bank', 'Transfer through online banking or over the counter. Keep your deposit slip or a screenshot of the transfer confirmation.', 3)
) as v(name, kind, instructions, sort_order)
where not exists (select 1 from public.payment_methods m where m.name = v.name);

-- Concept showcases (clearly labelled as concepts, not client work). Replace them in Admin → Portfolio.
insert into public.portfolio_projects (slug, title, category, summary, description, tech, is_concept, is_featured, sort_order)
values
  ('concept-cafe-ordering', 'Café Ordering Concept', 'Smart Ordering System',
   'A mobile-first ordering flow for a neighbourhood café.',
   'A concept build showing menu browsing, cart, pickup scheduling and an order board for staff.',
   '["React", "Supabase", "Tailwind CSS"]', true, true, 1),
  ('concept-clinic-booking', 'Clinic Booking Concept', 'Booking System',
   'Appointment scheduling for a small clinic.',
   'A concept build showing doctor schedules, slot selection and a front-desk calendar.',
   '["React", "Supabase", "PostgreSQL"]', true, true, 2),
  ('concept-freelancer-portfolio', 'Freelancer Portfolio Concept', 'Personal Website',
   'A personal site for a creative freelancer.',
   'A concept build with project case studies, a services list and a contact form.',
   '["Vite", "React", "Motion"]', true, true, 3),
  ('concept-hardware-store', 'Hardware Store Website Concept', 'Business Website',
   'A catalogue-style website for a local store.',
   'A concept build with product categories, store location and inquiry forms.',
   '["React", "Tailwind CSS"]', true, false, 4),
  ('concept-delivery-app', 'Delivery Rider App Concept', 'Android Application',
   'An Android app for tracking deliveries.',
   'A concept build showing job lists, delivery status updates and proof of delivery.',
   '["React Native", "Supabase"]', true, false, 5),
  ('concept-fitness-app', 'Fitness Studio App Concept', 'iOS + Android Application',
   'Class booking for a fitness studio on iOS and Android.',
   'A concept build with class schedules, memberships and push-style reminders.',
   '["React Native", "Expo", "Supabase"]', true, false, 6)
on conflict (slug) do nothing;

insert into public.theme_settings (id) values (1) on conflict (id) do nothing;

-- Private operational settings (never sent to the public site).
insert into public.website_settings (key, draft, published) values
  ('operations',
   '{"deposit_percent": 50, "tracking_link_days": 30, "points_per_100_pesos": 1, "referral_bonus_points": 50}',
   '{"deposit_percent": 50, "tracking_link_days": 30, "points_per_100_pesos": 1, "referral_bonus_points": 50}')
on conflict (key) do nothing;
