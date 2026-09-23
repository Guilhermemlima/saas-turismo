-- Quotes: database-computed pricing, frozen ready quotes, forged totals, roles and tenant isolation.
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a6', 'owner-q@test.local', '{"full_name":"Owner Q"}'),
  ('00000000-0000-0000-0000-0000000000c6', 'atendente-q@test.local', '{"full_name":"Atendente Q"}'),
  ('00000000-0000-0000-0000-0000000000b6', 'outra-q@test.local', '{"full_name":"Outra Q"}');

create or replace function pg_temp.login(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

select pg_temp.login('00000000-0000-0000-0000-0000000000b6');
select public.create_agency_with_owner('Outra Q');

select pg_temp.login('00000000-0000-0000-0000-0000000000a6');
select set_config('test.agency', public.create_agency_with_owner('Agência Q')::text, true);
insert into public.agency_invitations (agency_id, email, role, token_hash, invited_by)
values (current_setting('test.agency')::uuid, 'atendente-q@test.local', 'attendant', repeat('9', 64), '00000000-0000-0000-0000-0000000000a6');
insert into public.customers (id, agency_id, full_name, phone_e164)
values ('30000000-0000-0000-0000-0000000000a6', current_setting('test.agency')::uuid, 'Carla', '+5582999990006');
select public.create_travel_request('30000000-0000-0000-0000-0000000000a6', 'Maceió', 'qualifying', null, '{"destination":"Maceió"}'::jsonb);

insert into public.quotes (id, agency_id, deal_id, customer_id, title)
select '40000000-0000-0000-0000-0000000000a6', agency_id, id, customer_id, 'Maceió dezembro' from public.deals;

select lives_ok($$
  insert into public.quote_options (id, agency_id, quote_id, title, service_fee_cents, items_price_cents, total_cents)
  values ('41000000-0000-0000-0000-0000000000a6', current_setting('test.agency')::uuid, '40000000-0000-0000-0000-0000000000a6', 'Resort', 20000, 999999999, 999999999)
$$, 'option created');
select is((select items_price_cents from public.quote_options), 0::bigint, 'forged aggregates on insert are ignored');
select is((select total_cents from public.quote_options), 20000::bigint, 'total starts as the service fee');

-- 2 flight seats: cost 1.000,00 + markup 150,00 + fees 80,00 each; commission 0.
insert into public.quote_items (agency_id, option_id, item_type, title, quantity, unit_cost_cents, unit_markup_cents, unit_fees_cents)
values (current_setting('test.agency')::uuid, '41000000-0000-0000-0000-0000000000a6', 'flight', 'REC → MCZ', 2, 100000, 15000, 8000);
-- Hotel 7 nights: cost 3.000,00, markup 450,00; supplier commission 300,00.
insert into public.quote_items (agency_id, option_id, item_type, title, quantity, unit_cost_cents, unit_markup_cents, commission_cents)
values (current_setting('test.agency')::uuid, '41000000-0000-0000-0000-0000000000a6', 'hotel', 'Resort 5*', 1, 300000, 45000, 30000);

select is((select price_cents from public.quote_items where item_type = 'flight'), 246000::bigint, 'item price = qty × (cost + markup + fees)');
select is((select items_price_cents from public.quote_options), 591000::bigint, 'option subtotal sums item prices');
select is((select items_cost_cents from public.quote_options), 500000::bigint, 'option cost sums qty × unit cost');
select is((select total_cents from public.quote_options), 611000::bigint, 'total = subtotal + service fee − discount');
select is((select margin_cents from public.quote_options), 95000::bigint, 'margin = markup + service fee − discount');
select is((select commission_cents from public.quote_options), 30000::bigint, 'commission aggregated separately');

update public.quote_options set discount_cents = 11000;
select is((select total_cents from public.quote_options), 600000::bigint, 'discount lowers the total');
select throws_ok($$ update public.quote_options set discount_cents = 99999999 $$, '23514', null, 'discount cannot exceed the total');
select throws_ok($$ update public.quote_options set total_cents = 1 $$, '42501', null, 'users cannot write computed totals');

delete from public.quote_items where item_type = 'flight';
select is((select items_price_cents from public.quote_options), 345000::bigint, 'deleting an item recalculates the option');

update public.quotes set status = 'ready';
select is((select ready_at is not null from public.quotes), true, 'ready quotes are timestamped');
select throws_ok(
  $$ insert into public.quote_items (agency_id, option_id, item_type, title) values (current_setting('test.agency')::uuid, '41000000-0000-0000-0000-0000000000a6', 'tour', 'Passeio') $$,
  '55000', null, 'ready quotes are frozen');
update public.quotes set status = 'draft';
select lives_ok(
  $$ insert into public.quote_items (agency_id, option_id, item_type, title) values (current_setting('test.agency')::uuid, '41000000-0000-0000-0000-0000000000a6', 'tour', 'Passeio') $$,
  'reopened quotes can be edited again');

-- Attendants do not see quotes; other agencies neither.
select pg_temp.login('00000000-0000-0000-0000-0000000000c6');
select public.accept_invitation(repeat('9', 64));
select is((select count(*)::int from public.quotes), 0, 'attendants cannot read quotes');

select pg_temp.login('00000000-0000-0000-0000-0000000000b6');
select throws_ok(
  $$ insert into public.quote_options (agency_id, quote_id, title) values (current_setting('test.agency')::uuid, '40000000-0000-0000-0000-0000000000a6', 'Intrusa') $$,
  '42501', null, 'other agencies cannot add options');

select * from finish();
rollback;
