-- Job queue semantics (claim, retry with backoff, dead-letter, dedupe) and domain events.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- Queue -------------------------------------------------------------------------------------------
select isnt(public.enqueue_job('tasks.scan_overdue', '{}'::jsonb, null, now(), 'scan:1'), null, 'job enqueued');
select is(public.enqueue_job('tasks.scan_overdue', '{}'::jsonb, null, now(), 'scan:1'), null, 'duplicate pending job is ignored (dedupe)');
select public.enqueue_job('future.job', '{}'::jsonb, null, now() + interval '1 hour');

select is((select count(*)::int from public.claim_jobs('worker-a', 10)), 1, 'only ready jobs are claimed');
select is((select count(*)::int from public.claim_jobs('worker-b', 10)), 0, 'a claimed job is not handed to another worker');

select is(
  public.fail_job((select id from public.jobs where type = 'tasks.scan_overdue'), 'timeout', true)::text,
  'queued', 'retryable failure goes back to the queue');
select is(
  (select run_at > now() + interval '25 seconds' from public.jobs where type = 'tasks.scan_overdue'),
  true, 'retry is delayed (backoff)');
select is((select last_error from public.jobs where type = 'tasks.scan_overdue'), 'timeout', 'error message is kept');

update public.jobs set attempts = max_attempts, status = 'running' where type = 'tasks.scan_overdue';
select is(
  public.fail_job((select id from public.jobs where type = 'tasks.scan_overdue'), 'still failing', true)::text,
  'dead', 'after max attempts the job is dead-lettered');
select isnt(public.enqueue_job('tasks.scan_overdue', '{}'::jsonb, null, now(), 'scan:1'), null, 'a dead job frees its dedupe key');

select public.enqueue_job('bad.input', '{}'::jsonb);
select is(
  public.fail_job((select id from public.jobs where type = 'bad.input'), 'invalid payload', false)::text,
  'failed', 'non-retryable errors fail immediately');

update public.jobs set run_at = now() - interval '1 minute' where type = 'future.job';
select public.claim_jobs('worker-c', 10);
update public.jobs set locked_at = now() - interval '10 minutes' where type = 'future.job';
select is((select count(*)::int from public.claim_jobs('worker-d', 10, 120) where type = 'future.job'), 1, 'abandoned locks are reclaimed');

-- Domain events -------------------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a5', 'owner-ev@test.local', '{"full_name":"Owner EV"}');
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000a5', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select set_config('test.agency', public.create_agency_with_owner('Agência Eventos')::text, true);
insert into public.customers (id, agency_id, full_name, phone_e164)
values ('30000000-0000-0000-0000-0000000000a5', current_setting('test.agency')::uuid, 'Rui', '+5582999990005');
select public.create_travel_request('30000000-0000-0000-0000-0000000000a5', 'Recife', 'request_complete', null,
  '{"destination":"Recife","status":"complete","date_flexibility":"month_only","travel_month":"2027-03-01","adults":2}'::jsonb);
update public.deals set stage_id = (select id from public.pipeline_stages where system_key = 'confirmed');

select throws_ok($$ select count(*) from public.domain_events $$, '42501', null, 'users cannot read the outbox');
select set_config('role', 'postgres', true);

select is(
  (select string_agg(type, ',' order by type) from public.domain_events where agency_id = current_setting('test.agency')::uuid),
  'deal.created,deal.stage_changed,travel_request.completed', 'state changes emit domain events');
select is(
  (select (payload ->> 'won')::boolean from public.domain_events where type = 'deal.stage_changed'),
  true, 'won stage is flagged in the event payload');
select is((select count(*)::int from public.claim_domain_events(100)), 3, 'dispatcher claims pending events');
select is((select count(*)::int from public.claim_domain_events(100)), 0, 'events are dispatched only once');

select * from finish();
rollback;
