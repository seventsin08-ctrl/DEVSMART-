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
  update public.website_pages set published_content = draft_content, published_at = now();

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
