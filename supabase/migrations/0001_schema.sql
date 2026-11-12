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
