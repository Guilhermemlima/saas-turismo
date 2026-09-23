-- Tags, notes, preferences and tasks: tenant safety, authorship and task automation rules.
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a4', 'owner-cd@test.local', '{"full_name":"Owner CD"}'),
  ('00000000-0000-0000-0000-0000000000c4', 'consultor-cd@test.local', '{"full_name":"Consultor CD"}'),
  ('00000000-0000-0000-0000-0000000000b4', 'outra-cd@test.local', '{"full_name":"Outra CD"}');

create or replace function pg_temp.login(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

select pg_temp.login('00000000-0000-0000-0000-0000000000b4');
select set_config('test.other_agency', public.create_agency_with_owner('Outra CD')::text, true);

select pg_temp.login('00000000-0000-0000-0000-0000000000a4');
select set_config('test.agency', public.create_agency_with_owner('Agência CD')::text, true);
insert into public.agency_invitations (agency_id, email, role, token_hash, invited_by)
values (current_setting('test.agency')::uuid, 'consultor-cd@test.local', 'consultant', repeat('f', 64), '00000000-0000-0000-0000-0000000000a4');
insert into public.customers (id, agency_id, full_name, phone_e164)
values ('30000000-0000-0000-0000-0000000000a4', current_setting('test.agency')::uuid, 'Ana Souza', '+5582999990004');

select lives_ok($$ insert into public.tags (agency_id, name, color) values (current_setting('test.agency')::uuid, 'VIP', 'amber') $$, 'owner creates a tag');
select throws_ok($$ insert into public.tags (agency_id, name) values (current_setting('test.agency')::uuid, 'vip') $$, '23505', null, 'tag names are unique per agency (case-insensitive)');
select lives_ok(
  $$ insert into public.customer_tags (agency_id, customer_id, tag_id) select agency_id, '30000000-0000-0000-0000-0000000000a4', id from public.tags $$,
  'tag applied to a customer');

select lives_ok(
  $$ insert into public.notes (agency_id, customer_id, body, author_user_id) values (current_setting('test.agency')::uuid, '30000000-0000-0000-0000-0000000000a4', 'Prefere contato à noite', '00000000-0000-0000-0000-0000000000a4') $$,
  'owner writes a note');
select throws_ok(
  $$ insert into public.notes (agency_id, customer_id, body, author_user_id) values (current_setting('test.agency')::uuid, '30000000-0000-0000-0000-0000000000a4', 'forjada', '00000000-0000-0000-0000-0000000000c4') $$,
  '42501', null, 'notes cannot be written in someone else''s name');

select lives_ok(
  $$ insert into public.customer_preferences (agency_id, customer_id, category, value) values (current_setting('test.agency')::uuid, '30000000-0000-0000-0000-0000000000a4', 'accommodation', 'Hotel 4 estrelas') $$,
  'preference stored');
select throws_ok(
  $$ insert into public.customer_preferences (agency_id, customer_id, category, value, source) values (current_setting('test.agency')::uuid, '30000000-0000-0000-0000-0000000000a4', 'flight', 'Voo direto', 'ai') $$,
  '42501', null, 'users cannot store preferences as if they came from the AI');

-- Consultant joins and receives a task.
select pg_temp.login('00000000-0000-0000-0000-0000000000c4');
select public.accept_invitation(repeat('f', 64));
select pg_temp.login('00000000-0000-0000-0000-0000000000a4');

select lives_ok(
  $$ insert into public.tasks (agency_id, title, task_type, assigned_member_id, customer_id, created_by)
     select current_setting('test.agency')::uuid, 'Ligar para a Ana', 'call_customer', m.id, '30000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a4'
     from public.agency_members m where m.user_id = '00000000-0000-0000-0000-0000000000c4' $$,
  'owner assigns a task to the consultant');

select pg_temp.login('00000000-0000-0000-0000-0000000000c4');
select is((select count(*)::int from public.notifications where title like '📋 Nova tarefa%'), 1, 'assignee is notified');
update public.tasks set status = 'done';
select is((select completed_at is not null from public.tasks), true, 'completing a task stamps completed_at');
delete from public.notes;
select is((select count(*)::int from public.notes), 1, 'a consultant cannot delete another author''s note');

select pg_temp.login('00000000-0000-0000-0000-0000000000b4');
select is((select count(*)::int from public.tags), 0, 'other agency sees no tags from agency A');
select is((select count(*)::int from public.tasks), 0, 'other agency sees no tasks');
insert into public.tags (agency_id, name) values (current_setting('test.other_agency')::uuid, 'Minha tag');
select throws_ok(
  $$ insert into public.customer_tags (agency_id, customer_id, tag_id)
     select current_setting('test.other_agency')::uuid, '30000000-0000-0000-0000-0000000000a4', id from public.tags $$,
  '23503', null, 'cannot tag a customer from another agency');
select throws_ok(
  $$ insert into public.tasks (agency_id, title, created_by) values (current_setting('test.agency')::uuid, 'Intrusa', '00000000-0000-0000-0000-0000000000b4') $$,
  '42501', null, 'cannot create tasks in another agency');

select * from finish();
rollback;
