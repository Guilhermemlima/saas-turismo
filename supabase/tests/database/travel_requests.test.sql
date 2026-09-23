-- Pipeline, deals and travel requests: seeding, tenant safety and data rules.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner-a@test.local', '{"full_name":"Owner A"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner-b@test.local', '{"full_name":"Owner B"}');

create or replace function pg_temp.login(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Agencies created through onboarding get the default pipeline.
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select public.create_agency_with_owner('Agência B');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select public.create_agency_with_owner('Agência A');

select is((select count(*)::int from public.pipelines), 1, 'owner A sees exactly one (own) pipeline');
select is((select count(*)::int from public.pipeline_stages), 13, 'default pipeline has the 13 tourism stages');
select is(
  (select string_agg(system_key, ',' order by position) from public.pipeline_stages where is_won or is_lost),
  'confirmed,lost', 'won and lost stages are flagged');

insert into public.customers (id, agency_id, full_name, phone_e164)
select '30000000-0000-0000-0000-0000000000a1', agency_id, 'João Silva', '+5582999990001' from public.agency_members limit 1;

select lives_ok($$
  select public.create_travel_request(
    '30000000-0000-0000-0000-0000000000a1', 'Maceió', 'qualifying', null,
    '{"destination":"Maceió","date_flexibility":"exact","departure_date":"2026-12-10","return_date":"2026-12-17","adults":2,"children_ages":[7],"needs_hotel":true,"agency_id":"00000000-0000-0000-0000-000000000000"}'::jsonb)
$$, 'create_travel_request creates deal + request');

select is((select count(*)::int from public.deals), 1, 'one deal created');
select is((select nights::int from public.travel_requests), 7, 'nights computed from dates');
select is((select children::int from public.travel_requests), 1, 'children computed from children_ages');
select is(
  (select tr.agency_id = d.agency_id from public.travel_requests tr join public.deals d on d.id = tr.deal_id),
  true, 'forged agency_id in the payload is ignored');
select is((select count(*)::int from public.deal_stage_history), 1, 'stage history recorded on creation');

update public.deals set stage_id = (select id from public.pipeline_stages where system_key = 'request_complete');
select is((select count(*)::int from public.deal_stage_history), 2, 'stage change recorded in history');

select throws_ok(
  $$ update public.travel_requests set return_date = '2026-12-01' $$,
  '23514', null, 'return date before departure is rejected');

select throws_ok(
  $$ update public.travel_requests set children_ages = '{7,18}' $$,
  '23514', null, 'children must be 0-17 years old');

-- Owner B cannot see nor attach to agency A data.
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.deals), 0, 'owner B sees no deals from agency A');
select throws_ok($$
  select public.create_travel_request('30000000-0000-0000-0000-0000000000a1', 'Intruso', 'qualifying', null, '{}'::jsonb)
$$, 'P0002', null, 'owner B cannot create a request for an agency A customer');

select * from finish();
rollback;
