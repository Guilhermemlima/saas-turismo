-- Quotes: server-side pricing, draft lock, deal automation, events and who can read margins.
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a6', 'owner-q@test.local', '{"full_name":"Owner Q"}'),
  ('00000000-0000-0000-0000-0000000000c6', 'atendente-q@test.local', '{"full_name":"Atendente Q"}'),
  ('00000000-0000-0000-0000-0000000000d6', 'financeiro-q@test.local', '{"full_name":"Financeiro Q"}'),
  ('00000000-0000-0000-0000-0000000000b6', 'outra-q@test.local', '{"full_name":"Outra Q"}');

create or replace function pg_temp.login(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

select pg_temp.login('00000000-0000-0000-0000-0000000000b6');
select set_config('test.other_agency', public.create_agency_with_owner('Outra Q')::text, true);

select pg_temp.login('00000000-0000-0000-0000-0000000000a6');
select set_config('test.agency', public.create_agency_with_owner('Agência Q')::text, true);
insert into public.agency_invitations (agency_id, email, role, token_hash, invited_by) values
  (current_setting('test.agency')::uuid, 'atendente-q@test.local', 'attendant', repeat('a', 64), '00000000-0000-0000-0000-0000000000a6'),
  (current_setting('test.agency')::uuid, 'financeiro-q@test.local', 'financial', repeat('d', 64), '00000000-0000-0000-0000-0000000000a6');
insert into public.customers (id, agency_id, full_name, phone_e164)
values ('30000000-0000-0000-0000-0000000000a6', current_setting('test.agency')::uuid, 'Lia', '+5582999990006');
select set_config('test.deal', (select deal_id::text from public.create_travel_request('30000000-0000-0000-0000-0000000000a6', 'Maceió · Lia', 'request_complete', null,
  '{"destination":"Maceió","status":"complete","date_flexibility":"month_only","travel_month":"2027-01-01","adults":2}'::jsonb)), true);
insert into public.tasks (agency_id, title, task_type, deal_id, customer_id, created_by)
values (current_setting('test.agency')::uuid, 'Preparar cotação', 'prepare_quote', current_setting('test.deal')::uuid,
        '30000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-0000000000a6');

-- Creating ------------------------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.quotes (id, agency_id, deal_id, customer_id, title, created_by)
     values ('40000000-0000-0000-0000-0000000000a6', current_setting('test.agency')::uuid, current_setting('test.deal')::uuid,
             '30000000-0000-0000-0000-0000000000a6', 'Maceió em janeiro', '00000000-0000-0000-0000-0000000000a6') $$,
  'owner creates a quote for a deal');
select is((select travel_request_id is not null from public.quotes), true, 'quote is linked to the deal travel request');
select is(
  (select s.system_key from public.deals d join public.pipeline_stages s on s.id = d.stage_id where d.id = current_setting('test.deal')::uuid),
  'quoting', 'creating a quote moves the deal to "Em cotação"');

insert into public.quote_options (id, agency_id, quote_id, title, service_fee_cents)
values ('41000000-0000-0000-0000-0000000000a6', current_setting('test.agency')::uuid, '40000000-0000-0000-0000-0000000000a6', 'Opção 1', 15000);

-- Pricing (unit values × quantity) -----------------------------------------------------------------
insert into public.quote_items (agency_id, quote_option_id, item_type, title, quantity, cost_cents, markup_cents, pass_through_fees_cents, commission_cents, price_cents, total_cents)
values
  (current_setting('test.agency')::uuid, '41000000-0000-0000-0000-0000000000a6', 'flight', 'Voo GRU → MCZ', 2, 100000, 10000, 5000, 0, 1, 1),
  (current_setting('test.agency')::uuid, '41000000-0000-0000-0000-0000000000a6', 'hotel', 'Resort 5 noites', 1, 300000, 45000, 0, 30000, 0, 0);

select is((select price_cents from public.quote_items where item_type = 'flight'), 115000::bigint, 'item price = cost + markup + fees (client value ignored)');
select is((select total_cents from public.quote_items where item_type = 'flight'), 230000::bigint, 'item total = price × quantity');
select is((select subtotal_cents from public.quote_options), 575000::bigint, 'option subtotal sums the items');
select is((select total_cents from public.quote_options), 590000::bigint, 'option total adds the service fee');
select is((select margin_cents from public.quote_options), 80000::bigint, 'margin = markups + fee − discount');
select is((select commission_total_cents from public.quote_options), 30000::bigint, 'supplier commission is totalled separately');

update public.quote_options set discount_cents = 20000, total_cents = 1;
select is((select total_cents from public.quote_options), 570000::bigint, 'discount lowers the total (forged total ignored)');
select throws_ok($$ update public.quote_options set discount_cents = 600000 $$, '23514', null, 'discount above the option value is rejected');
select throws_ok(
  $$ update public.quotes set currency = 'USD' where id = '40000000-0000-0000-0000-0000000000a6' $$,
  '23514', null, 'currency cannot change once the quote has items');

-- Ready ----------------------------------------------------------------------------------------------
insert into public.quotes (id, agency_id, deal_id, customer_id, title, created_by)
values ('40000000-0000-0000-0000-0000000000b6', current_setting('test.agency')::uuid, current_setting('test.deal')::uuid,
        '30000000-0000-0000-0000-0000000000a6', 'Vazia', '00000000-0000-0000-0000-0000000000a6');
select throws_ok($$ update public.quotes set status = 'ready' where title = 'Vazia' $$, '23514', null, 'a quote without items cannot be ready');

update public.quotes set status = 'ready' where id = '40000000-0000-0000-0000-0000000000a6';
select is(
  (select s.system_key from public.deals d join public.pipeline_stages s on s.id = d.stage_id where d.id = current_setting('test.deal')::uuid),
  'quote_ready', 'a ready quote moves the deal to "Cotação pronta"');
select is((select status::text from public.tasks where task_type = 'prepare_quote'), 'done', 'the prepare-quote task is completed');
select throws_ok($$ update public.quote_items set markup_cents = 0 $$, '55000', null, 'items of a ready quote are locked');
select throws_ok($$ delete from public.quote_options $$, '55000', null, 'options of a ready quote cannot be removed');

select set_config('role', 'postgres', true);
select is(
  (select string_agg(type, ',' order by type) from public.domain_events where aggregate_type = 'quote' and aggregate_id = '40000000-0000-0000-0000-0000000000a6'),
  'quote.created,quote.ready', 'quote.created and quote.ready are emitted');

-- Who sees quotes (and their margins) -----------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000c6');
select public.accept_invitation(repeat('a', 64));
select is((select count(*)::int from public.quote_options), 0, 'attendants cannot read quote options (no margin exposure)');
select is((select count(*)::int from public.quotes), 0, 'attendants cannot read quotes');
select throws_ok(
  $$ insert into public.quotes (agency_id, deal_id, customer_id, title, created_by)
     values (current_setting('test.agency')::uuid, current_setting('test.deal')::uuid, '30000000-0000-0000-0000-0000000000a6', 'Da atendente', '00000000-0000-0000-0000-0000000000c6') $$,
  '42501', null, 'attendants cannot create quotes');

select pg_temp.login('00000000-0000-0000-0000-0000000000d6');
select public.accept_invitation(repeat('d', 64));
select is((select margin_cents from public.quote_options), 60000::bigint, 'financial reads margins');
update public.quote_options set title = 'Alterada';
select is((select title from public.quote_options), 'Opção 1', 'financial cannot edit quotes');

select pg_temp.login('00000000-0000-0000-0000-0000000000b6');
select is((select count(*)::int from public.quotes), 0, 'other agency sees no quotes');
select throws_ok(
  $$ insert into public.quote_options (agency_id, quote_id, title) values (current_setting('test.other_agency')::uuid, '40000000-0000-0000-0000-0000000000b6', 'Intrusa') $$,
  '23503', null, 'cannot add an option to another agency quote');

select * from finish();
rollback;
