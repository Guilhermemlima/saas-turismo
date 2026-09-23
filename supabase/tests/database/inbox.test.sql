-- Inbox: simulated conversations, message rules, notifications, takeover audit and isolation.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a3', 'owner-inbox@test.local', '{"full_name":"Owner Inbox"}'),
  ('00000000-0000-0000-0000-0000000000f3', 'financeiro@test.local', '{"full_name":"Financeiro"}'),
  ('00000000-0000-0000-0000-0000000000b3', 'outra@test.local', '{"full_name":"Outra Agência"}');

create or replace function pg_temp.login(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

select pg_temp.login('00000000-0000-0000-0000-0000000000b3');
select public.create_agency_with_owner('Outra Agência');

select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select set_config('test.agency', public.create_agency_with_owner('Agência Inbox')::text, true);

insert into public.customers (id, agency_id, full_name, phone_e164, owner_member_id)
select '30000000-0000-0000-0000-0000000000a3', current_setting('test.agency')::uuid, 'João Silva', '+5582999990003', id
from public.agency_members where user_id = '00000000-0000-0000-0000-0000000000a3';

select set_config('test.conv', public.start_simulated_conversation('30000000-0000-0000-0000-0000000000a3')::text, true);

select is((select count(*)::int from public.channels where type = 'simulator'), 1, 'simulator channel created on demand');
select is(
  public.start_simulated_conversation('30000000-0000-0000-0000-0000000000a3')::text, current_setting('test.conv'),
  'starting again reuses the open conversation');
select is((select is_simulation from public.conversations), true, 'conversation is flagged as simulation');

select lives_ok(
  $$ select public.post_conversation_message(current_setting('test.conv')::uuid, 'Queria viajar para Maceió em dezembro', true) $$,
  'staff can simulate a customer message on a test conversation');
select is((select unread_count from public.conversations), 1, 'inbound message increments unread count');
select is((select last_inbound_at is not null from public.conversations), true, 'last inbound time recorded (24h window)');
select is((select last_contact_at is not null from public.customers), true, 'customer last contact updated');
select is((select count(*)::int from public.notifications where type = 'customer_replied'), 1, 'owner of the customer is notified');

select lives_ok(
  $$ select public.post_conversation_message(current_setting('test.conv')::uuid, 'Que ótimo! Quais datas?') $$,
  'staff can reply');
select is(
  (select status::text || '/' || sender::text from public.messages where direction = 'outbound' limit 1),
  'delivered/human', 'simulator replies are delivered immediately as human messages');
select is((select unread_count from public.conversations), 0, 'replying clears unread count');

select throws_ok($$ insert into public.messages (agency_id, conversation_id, channel_id, direction, sender, body, status)
  select agency_id, id, channel_id, 'inbound', 'customer', 'forjada', 'received' from public.conversations $$,
  '42501', null, 'messages cannot be inserted directly');

update public.conversations set mode = 'ai';
select is((select count(*)::int from public.audit_logs where action = 'conversation.returned_to_ai'), 1, 'mode change is audited');
select public.post_conversation_message(current_setting('test.conv')::uuid, 'Assumindo a conversa');
select is((select mode::text from public.conversations), 'human', 'a human reply takes the conversation over');

-- Other agency sees nothing and cannot post.
select pg_temp.login('00000000-0000-0000-0000-0000000000b3');
select is((select count(*)::int from public.messages), 0, 'other agency cannot read messages');
select throws_ok(
  $$ select public.post_conversation_message(current_setting('test.conv')::uuid, 'Intrusão') $$,
  '42501', null, 'other agency cannot post in the conversation');
select is((select count(*)::int from public.notifications), 0, 'notifications are private to their user');

select * from finish();
rollback;
