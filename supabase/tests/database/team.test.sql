-- Team invitations, last-owner protection, onboarding steps and logo storage permissions.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a2', 'owner-a@test.local', '{"full_name":"Owner A"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'consultor@test.local', '{"full_name":"Consultora C"}'),
  ('00000000-0000-0000-0000-0000000000d2', 'intruso@test.local', '{"full_name":"Intruso D"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'manager@test.local', '{"full_name":"Gerente E"}');

create or replace function pg_temp.login(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select set_config('test.agency', public.create_agency_with_owner('Agência Equipe')::text, true);

select is(
  (select email from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'),
  'owner-a@test.local', 'profiles keep a copy of the e-mail');

-- Owner invites a consultant and a manager.
insert into public.agency_invitations (agency_id, email, role, token_hash, invited_by)
select agency_id, 'consultor@test.local', 'consultant', repeat('a', 64), '00000000-0000-0000-0000-0000000000a2'
from public.agency_members limit 1;
insert into public.agency_invitations (agency_id, email, role, token_hash, invited_by)
select agency_id, 'manager@test.local', 'manager', repeat('b', 64), '00000000-0000-0000-0000-0000000000a2'
from public.agency_members limit 1;

select throws_ok($$
  insert into public.agency_invitations (agency_id, email, role, token_hash, invited_by)
  select agency_id, 'consultor@test.local', 'attendant', repeat('c', 64), '00000000-0000-0000-0000-0000000000a2'
  from public.agency_members limit 1
$$, '23505', null, 'only one pending invitation per e-mail');

select throws_ok(
  $$ update public.agency_members set role = 'manager' $$,
  'P0001', null, 'the last active owner cannot be demoted');

-- Someone else with the link cannot use it.
select pg_temp.login('00000000-0000-0000-0000-0000000000d2');
select is((select status from public.get_invitation(repeat('a', 64))), 'pending', 'invitee preview shows a pending invitation');
select throws_ok($$ select public.accept_invitation(repeat('a', 64)) $$, '42501', null, 'a forwarded link does not work for another e-mail');
select is((select count(*)::int from public.agency_invitations), 0, 'outsiders cannot list invitations');

-- The invited consultant accepts.
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
select lives_ok($$ select public.accept_invitation(repeat('a', 64)) $$, 'invited user accepts the invitation');
select is((select role::text from public.agency_members where user_id = '00000000-0000-0000-0000-0000000000c2'), 'consultant', 'membership created with the invited role');
select throws_ok($$ select public.accept_invitation(repeat('a', 64)) $$, 'P0002', null, 'an invitation cannot be used twice');
select throws_ok(
  $$ insert into public.agency_invitations (agency_id, email, role, token_hash, invited_by)
     select agency_id, 'x@test.local', 'attendant', repeat('d', 64), '00000000-0000-0000-0000-0000000000c2'
     from public.agency_members where user_id = '00000000-0000-0000-0000-0000000000c2' $$,
  '42501', null, 'consultants cannot invite');
select throws_ok(
  $$ select public.mark_onboarding_step((select agency_id from public.agency_members limit 1), 2::smallint) $$,
  '42501', null, 'consultants cannot complete onboarding steps');

-- Manager joins and tries to escalate.
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select lives_ok($$ select public.accept_invitation(repeat('b', 64)) $$, 'manager accepts the invitation');
select throws_ok(
  $$ insert into public.agency_invitations (agency_id, email, role, token_hash, invited_by)
     select agency_id, 'novo-dono@test.local', 'owner', repeat('e', 64), '00000000-0000-0000-0000-0000000000e2'
     from public.agency_members where user_id = '00000000-0000-0000-0000-0000000000e2' $$,
  '42501', null, 'managers cannot invite owners');
select lives_ok(
  $$ select public.mark_onboarding_step((select agency_id from public.agency_members where user_id = '00000000-0000-0000-0000-0000000000e2'), 2::smallint) $$,
  'managers can complete onboarding steps');
select is((select onboarding_completed_steps from public.agencies), '{1,2}'::smallint[], 'onboarding steps are accumulated without duplicates');

-- Logo storage: only managers/owners of the agency folder can write.
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) select 'agency-logos', agency_id || '/logo.png' from public.agency_members where user_id = '00000000-0000-0000-0000-0000000000e2' $$,
  'managers can upload the agency logo');
select pg_temp.login('00000000-0000-0000-0000-0000000000d2');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('agency-logos', current_setting('test.agency') || '/logo.png') $$,
  '42501', null, 'outsiders cannot upload into another agency folder');

select * from finish();
rollback;
