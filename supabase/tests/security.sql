-- Database security & business-rule tests. Runs inside one transaction and rolls back.
-- Usage: npm run test:db   (needs the local stack: npm run stack:up)
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.expect_error(p_sql text, p_like text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok   - %', p_label; return; end if;
    raise exception 'FAIL - %: unexpected error "%"', p_label, sqlerrm;
  end;
  raise exception 'FAIL - %: statement succeeded but should have been refused', p_label;
end $$;
create or replace function pg_temp.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL - %', p_label; end if;
  raise notice 'ok   - %', p_label;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- fixtures (as the migration owner)
insert into auth.users (id, email, email_confirmed_at, aud, role, instance_id)
values ('00000000-0000-4000-a000-000000000001', 'owner-test@devmart.test', now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
       ('00000000-0000-4000-a000-000000000002', 'stranger@devmart.test', now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.admin_roles (email, role) values ('owner-test@devmart.test', 'owner');
select pg_temp.ok((select user_id from public.admin_roles where email = 'owner-test@devmart.test') = '00000000-0000-4000-a000-000000000001', 'allowlisted e-mail is linked to its confirmed user');

insert into public.promotions (id, name, kind, code, discount_type, percent_bps, usage_limit)
values ('00000000-0000-4000-b000-000000000001', 'One use', 'promo_code', 'ONEUSE', 'percent', 1000, 1);

create temp table t_order on commit drop as
select public.create_order_tx(jsonb_build_object(
  'service_id', (select id from public.services order by sort_order limit 1),
  'customer', jsonb_build_object('full_name', 'Test Buyer', 'email', 'buyer@example.com', 'phone', '09171234567', 'facebook', 'fb.com/buyer'),
  'project', jsonb_build_object('name', 'Test project', 'description', 'A test'),
  'items', jsonb_build_array(jsonb_build_object('kind', 'service', 'name', 'Personal Website', 'unit_price_centavos', 500000, 'quantity', 1)),
  'subtotal_centavos', 500000, 'discount_centavos', 50000, 'promotion_id', '00000000-0000-4000-b000-000000000001', 'promo_code', 'ONEUSE',
  'token_hash', repeat('a', 64), 'token_expires_at', now() + interval '30 days')) as r;
grant select on t_order to anon, authenticated;
select r ->> 'order_id' as oid, r ->> 'customer_id' as cid from t_order \gset

select pg_temp.ok((select r ->> 'reference' from t_order) ~ '^DVM-[0-9]{4}-[0-9]{6}$', 'order reference has the DVM-YYYY-NNNNNN format');
select pg_temp.ok((select total_centavos from public.orders where id = (select (r ->> 'order_id')::uuid from t_order)) = 450000, 'total = subtotal - discount');
select pg_temp.ok((select status || '/' || payment_status from public.orders where id = (select (r ->> 'order_id')::uuid from t_order)) = 'pending_review/awaiting_payment', 'new orders start as pending review / awaiting payment');
select pg_temp.ok(exists (select 1 from public.notifications where type = 'new_order'), 'a new-order notification is created');
select pg_temp.expect_error($$select public.create_order_tx('{"customer":{"full_name":"B","email":"b2@example.com","phone":"0917","facebook":"x"},"project":{"name":"P"},"items":[{"kind":"service","name":"S","unit_price_centavos":500000}],"subtotal_centavos":500000,"discount_centavos":50000,"promotion_id":"00000000-0000-4000-b000-000000000001","token_hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","token_expires_at":"2030-01-01"}')$$, 'PROMO_UNAVAILABLE', 'a promotion cannot be redeemed past its usage limit');
select pg_temp.expect_error($$select public.create_order_tx('{"customer":{"full_name":"B","email":"b3@example.com","phone":"0917","facebook":"x"},"project":{"name":"P"},"items":[{"kind":"service","name":"S","unit_price_centavos":500000}],"subtotal_centavos":500000,"discount_centavos":600000,"token_hash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","token_expires_at":"2030-01-01"}')$$, 'INVALID_DISCOUNT', 'a discount larger than the subtotal is refused (no negative totals)');
select pg_temp.expect_error($$select public.create_order_tx('{"customer":{"full_name":"B","email":"b4@example.com","phone":"0917","facebook":"x"},"project":{"name":"P"},"items":[{"kind":"service","name":"S","unit_price_centavos":400000}],"subtotal_centavos":500000,"discount_centavos":0,"token_hash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","token_expires_at":"2030-01-01"}')$$, 'SUBTOTAL_MISMATCH', 'line items must add up to the subtotal');

insert into public.payment_submissions (id, order_id, method_name, transaction_reference, proof_path, proof_mime, proof_size)
select '00000000-0000-4000-c000-000000000001', (r ->> 'order_id')::uuid, 'GCash', 'REF-1', 'x/y.png', 'image/png', 10 from t_order;
select pg_temp.ok((select payment_status || '/' || amount_paid_centavos from public.orders where id = (select (r ->> 'order_id')::uuid from t_order)) = 'proof_submitted/0', 'uploading a proof never marks the order as paid');
select pg_temp.expect_error($$update public.payment_submissions set status = 'verified' where id = '00000000-0000-4000-c000-000000000001'$$, 'payment_submissions_verified_check', 'a submission cannot be flipped to verified without the review data');

-- ── anonymous visitor ──
set local role anon;
select pg_temp.ok((select count(*) from public.services) = 6, 'anon can read the public catalogue');
select pg_temp.expect_error('select * from public.orders', 'permission denied', 'anon cannot read orders');
select pg_temp.expect_error('select * from public.customers', 'permission denied', 'anon cannot read customers');
select pg_temp.expect_error('select * from public.payment_submissions', 'permission denied', 'anon cannot read payment proofs');
select pg_temp.expect_error('select * from public.order_access_tokens', 'permission denied', 'anon cannot read tracking tokens');
select pg_temp.expect_error('select * from public.promotions', 'permission denied', 'anon cannot read the promotions table');
select pg_temp.expect_error($$insert into public.orders (reference) values ('DVM-2026-999999')$$, 'permission denied', 'anon cannot insert orders directly');
select pg_temp.expect_error('select public.get_site_draft()', 'permission denied', 'anon cannot read website drafts');
select pg_temp.expect_error($$select public.create_order_tx('{}')$$, 'permission denied', 'anon cannot call the order transaction');
select pg_temp.expect_error($$select public.next_reference('DVM')$$, 'permission denied', 'anon cannot mint references');
select pg_temp.ok(public.get_published_site() is not null, 'anon can read the published site');
reset role;

-- ── signed-in user who is NOT on the allowlist (even with MFA) ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated","aal":"aal2"}', true);
select pg_temp.ok(not public.is_admin(), 'a non-allowlisted user is not an admin');
select pg_temp.ok((select count(*) from public.orders) = 0, 'a non-admin sees no orders');
select pg_temp.ok((select count(*) from public.customers) = 0, 'a non-admin sees no customers');
select pg_temp.ok((select count(*) from public.audit_logs) = 0, 'a non-admin sees no audit logs');
select pg_temp.expect_error($$select public.publish_site('x')$$, 'FORBIDDEN', 'a non-admin cannot publish the website');
select pg_temp.expect_error($$select public.admin_review_payment('00000000-0000-4000-c000-000000000001', 'verified', 100, '')$$, 'FORBIDDEN', 'a non-admin cannot verify payments');
select pg_temp.expect_error($$insert into public.admin_roles (email, role) values ('evil@example.com', 'owner')$$, 'row-level security', 'a non-admin cannot add themselves to the allowlist');
select pg_temp.expect_error($$insert into public.services (slug, name, starting_price_centavos) values ('x', 'x', 1)$$, 'row-level security', 'a non-admin cannot change the catalogue');

-- ── allowlisted owner WITHOUT a second factor (aal1) ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated","aal":"aal1","email":"owner-test@devmart.test"}', true);
select pg_temp.ok(not public.is_admin(), 'the owner is not an admin until MFA is completed');
select pg_temp.ok((public.admin_status() ->> 'allowlisted')::boolean, 'the owner can see they are allowlisted (to start MFA)');
select pg_temp.ok((select count(*) from public.orders) = 0, 'without MFA the owner sees no orders');

-- ── owner with MFA (aal2) ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated","aal":"aal2","email":"owner-test@devmart.test"}', true);
select pg_temp.ok(public.is_admin(), 'allowlisted + MFA = admin');
select pg_temp.ok((select count(*) from public.orders where id = :'oid') = 1, 'the admin can read orders');
select pg_temp.expect_error($$update public.orders set amount_paid_centavos = 999999$$, 'permission denied', 'even an admin cannot edit the paid amount directly');
select pg_temp.expect_error($$update public.orders set payment_status = 'verified'$$, 'permission denied', 'even an admin cannot set payment status directly');
select pg_temp.expect_error($$update public.orders set total_centavos = 1, subtotal_centavos = 1$$, 'permission denied', 'the original quoted price of an order is immutable');
select pg_temp.expect_error($$insert into public.payment_transactions (order_id, kind, amount_centavos) select id, 'payment', 100 from public.orders$$, 'permission denied', 'the payment ledger cannot be written directly');
select pg_temp.expect_error($$delete from public.audit_logs where true$$, 'permission denied', 'the audit log cannot be deleted');
select pg_temp.expect_error($$select public.admin_review_payment('00000000-0000-4000-c000-000000000001', 'verified', null, '')$$, 'AMOUNT_REQUIRED', 'verifying requires the verified amount');
select public.admin_review_payment('00000000-0000-4000-c000-000000000001', 'verified', 250000, 'checked in GCash');
select pg_temp.ok((select payment_status || '/' || amount_paid_centavos || '/' || status from public.orders where id = :'oid') = 'verified/250000/payment_verified', 'verification updates paid amount, payment status and order status');
select pg_temp.ok((select count(*) from public.payment_transactions where order_id = :'oid' and kind = 'payment' and amount_centavos = 250000) = 1, 'verification writes exactly one ledger entry');
select pg_temp.ok((select points_balance from public.loyalty_accounts where customer_id = :'cid') = 25, 'loyalty points are earned on verified payments (1 per ₱100)');
select pg_temp.expect_error($$select public.admin_review_payment('00000000-0000-4000-c000-000000000001', 'verified', 250000, '')$$, 'INVALID_TRANSITION', 'a payment cannot be verified twice');
select public.admin_set_order_status(:'oid', 'in_development', 'kick-off');
select pg_temp.ok((select count(*) from public.project_milestones m join public.projects p on p.id = m.project_id where p.order_id = :'oid') = 5, 'moving to In Development creates the project and its milestones');
select pg_temp.ok(exists (select 1 from public.order_status_history where order_id = :'oid' and to_status = 'in_development' and note = 'kick-off' and changed_by is not null), 'status changes are recorded with note and actor');
select public.admin_review_payment('00000000-0000-4000-c000-000000000001', 'refunded', null, 'refund');
select pg_temp.ok((select payment_status || '/' || amount_paid_centavos from public.orders where id = :'oid') = 'refunded/0', 'a refund reverses the paid amount');

-- website: drafts are private until published; versions restore into the draft only
select public.save_site_draft('{"brand":{"name":"Draft Name"},"theme":{},"pages":{"home":{"title":"Home","sections":[]}}}');
select pg_temp.ok(public.get_published_site() -> 'brand' is null, 'a saved draft is not visible in the published site');
select public.publish_site('v1');
select pg_temp.ok(public.get_published_site() #>> '{brand,name}' = 'Draft Name', 'publishing makes the draft public');
select public.save_site_draft('{"brand":{"name":"Second"},"theme":{},"pages":{}}');
select public.publish_site('v2');
select public.restore_site_version((select id from public.website_page_versions where version_number = 1));
select pg_temp.ok(public.get_published_site() #>> '{brand,name}' = 'Second' and public.get_site_draft() #>> '{brand,name}' = 'Draft Name', 'restoring a version changes the draft, not the live site');
select pg_temp.expect_error($$select public.save_site_draft('{"pages":{"../etc":{}}}')$$, 'INVALID_PAGE', 'page slugs are validated');
update public.admin_roles set is_active = false where email <> 'owner-test@devmart.test';
select pg_temp.expect_error($$delete from public.admin_roles where email = 'owner-test@devmart.test'$$, 'LAST_OWNER', 'the last owner cannot be removed');
select pg_temp.ok((select count(*) from public.audit_logs where action in ('publish', 'restore') and actor_email = 'owner-test@devmart.test') = 3, 'publishing and restoring are audited');
select pg_temp.ok(exists (select 1 from public.audit_logs where entity_table = 'payment_transactions' and actor_email = 'owner-test@devmart.test'), 'ledger writes are attributed to the admin in the audit log');
reset role;

select pg_temp.ok(public.check_rate_limit('test:k', 2, 3600) and public.check_rate_limit('test:k', 2, 3600) and not public.check_rate_limit('test:k', 2, 3600), 'rate limiting blocks after the limit');

rollback;
\echo ALL DATABASE TESTS PASSED
