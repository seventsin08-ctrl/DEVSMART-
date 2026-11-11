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
