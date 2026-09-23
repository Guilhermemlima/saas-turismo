-- Tenant isolation and RBAC tests for the foundation tables.
-- Run with: npx supabase test db   (requires a local or linked Supabase database)
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

-- Fixtures (as postgres, bypassing RLS) ----------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'owner-a@test.local', '{"full_name":"Owner A"}'),
  ('00000000-0000-0000-0000-00000000000b', 'owner-b@test.local', '{"full_name":"Owner B"}'),
  ('00000000-0000-0000-0000-00000000000c', 'attendant-a@test.local', '{"full_name":"Attendant A"}'),
  ('00000000-0000-0000-0000-00000000000d', 'outsider@test.local', '{"full_name":"Outsider"}');

insert into public.agencies (id, name, slug) values
  ('10000000-0000-0000-0000-00000000000a', 'Agência A', 'agencia-a'),
  ('10000000-0000-0000-0000-00000000000b', 'Agência B', 'agencia-b');

insert into public.agency_members (id, agency_id, user_id, role) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'owner'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'owner'),
  ('20000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'attendant');

insert into public.customers (id, agency_id, full_name, phone_e164) values
  ('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'João Silva', '+5582999990001'),
  ('30000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'Maria Souza', '+5511999990002');

-- Helper: impersonate a user ------------------------------------------------------------
create or replace function pg_temp.login(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Owner A ------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');

select is((select count(*)::int from public.customers), 1, 'owner A sees only agency A customers');
select is((select count(*)::int from public.agencies), 1, 'owner A sees only agency A');
select is((select count(*)::int from public.agency_members), 2, 'owner A sees only agency A members');

select throws_ok(
  $$ insert into public.customers (agency_id, full_name, phone_e164)
     values ('10000000-0000-0000-0000-00000000000b', 'Intruso', '+5511900000000') $$,
  '42501', null, 'owner A cannot insert customers into agency B');

-- Silently matches zero rows under RLS; verified from agency B's side below.
update public.customers set full_name = 'Hacked' where id = '30000000-0000-0000-0000-00000000000b';

select throws_ok(
  $$ update public.customers set agency_id = '10000000-0000-0000-0000-00000000000b'
     where id = '30000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'agency_id is immutable');

select throws_ok(
  $$ update public.customers set owner_member_id = '20000000-0000-0000-0000-00000000000b'
     where id = '30000000-0000-0000-0000-00000000000a' $$,
  '23503', null, 'composite FK blocks assigning a consultant from another agency');

select lives_ok(
  $$ update public.customers set archived_at = now() where id = '30000000-0000-0000-0000-00000000000a' $$,
  'owner can archive a customer');

select throws_ok(
  $$ update public.agencies set status = 'active' where id = '10000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'owner cannot change the agency commercial status');

-- Attendant A ----------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000c');

select lives_ok(
  $$ insert into public.customers (agency_id, full_name, email)
     values ('10000000-0000-0000-0000-00000000000a', 'Carlos Lima', 'carlos@test.local') $$,
  'attendant can create customers in own agency');

select throws_ok(
  $$ update public.customers set archived_at = null where id = '30000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'attendant cannot archive/restore customers');

select throws_ok(
  $$ insert into public.agency_members (agency_id, user_id, role)
     values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', 'owner') $$,
  '42501', null, 'attendant cannot add members');

select is((select count(*)::int from public.audit_logs), 0, 'attendant cannot read audit logs');

-- Owner B -------------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');

select is(
  (select full_name from public.customers where id = '30000000-0000-0000-0000-00000000000b'),
  'Maria Souza', 'agency A could not modify agency B customers');

-- Outsider -----------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000d');

select is((select count(*)::int from public.customers), 0, 'user without membership sees no customers');
select is((select count(*)::int from public.agencies), 0, 'user without membership sees no agencies');

-- Onboarding RPC (outsider creates their own agency) ---------------------------------------
select lives_ok(
  $$ select public.create_agency_with_owner('Viagens Sol & Mar', '+5582999990003', 'CONTATO@SOL.COM', 'Maceió', 'al') $$,
  'authenticated user can create an agency through the RPC');

select is(
  (select role::text from public.agency_members where user_id = '00000000-0000-0000-0000-00000000000d'),
  'owner', 'creator becomes owner of the new agency');

select is(
  (select slug ~ '^viagens-sol-mar-[a-f0-9]{6}$' from public.agencies),
  true, 'slug is normalized and unique-suffixed');

select is((select count(*)::int from public.audit_logs where action = 'agency.created'), 1, 'agency creation is audited');

-- Anonymous ------------------------------------------------------------------------------------
select set_config('role', 'anon', true);
select throws_ok($$ select count(*) from public.customers $$, '42501', null, 'anon has no access to customers');

select * from finish();
rollback;
