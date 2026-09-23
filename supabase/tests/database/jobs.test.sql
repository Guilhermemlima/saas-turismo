-- Job queue semantics (claim, retry with backoff, dead-letter, dedupe) and domain events.
-- Test jobs use the `test.*` types and top priority so they never mix with the live queue.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- Queue -------------------------------------------------------------------------------------------
select set_config('test.scan', public.enqueue_job('test.scan', '{}'::jsonb, null, now(), 'test-scan:1', 5::smallint, 1::smallint)::text, true);
select isnt(current_setting('test.scan'), '', 'job enqueued');
select is(public.enqueue_job('test.scan', '{}'::jsonb, null, now(), 'test-scan:1', 5::smallint, 1::smallint), null, 'duplicate pending job is ignored (dedupe)');
select set_config('test.future', public.enqueue_job('test.future', '{}'::jsonb, null, now() + interval '1 hour', null, 5::smallint, 1::smallint)::text, true);

select is((select count(*)::int from public.claim_jobs('worker-a', 50) where type like 'test.%'), 1, 'only ready jobs are claimed');
select is((select count(*)::int from public.claim_jobs('worker-b', 50) where type like 'test.%'), 0, 'a claimed job is not handed to another worker');

select is(public.fail_job(current_setting('test.scan')::uuid, 'timeout', true)::text, 'queued', 'retryable failure goes back to the queue');
select is((select run_at > now() + interval '25 seconds' from public.jobs where id = current_setting('test.scan')::uuid), true, 'retry is delayed (backoff)');
select is((select last_error from public.jobs where id = current_setting('test.scan')::uuid), 'timeout', 'error message is kept');

update public.jobs set attempts = max_attempts, status = 'running' where id = current_setting('test.scan')::uuid;
select is(public.fail_job(current_setting('test.scan')::uuid, 'still failing', true)::text, 'dead', 'after max attempts the job is dead-lettered');
select isnt(public.enqueue_job('test.scan', '{}'::jsonb, null, now(), 'test-scan:1', 5::smallint, 1::smallint), null, 'a dead job frees its dedupe key');

select set_config('test.bad', public.enqueue_job('test.bad', '{}'::jsonb, null, now(), null, 5::smallint, 1::smallint)::text, true);
select is(public.fail_job(current_setting('test.bad')::uuid, 'invalid payload', false)::text, 'failed', 'non-retryable errors fail immediately');

update public.jobs set status = 'running', locked_by = 'crashed', locked_at = now() - interval '10 minutes', run_at = now() - interval '1 minute'
where id = current_setting('test.future')::uuid;
select is(
  (select count(*)::int from public.claim_jobs('worker-d', 50, 120) where id = current_setting('test.future')::uuid),
  1, 'abandoned locks are reclaimed');

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
  (select (payload ->> 'won')::boolean from public.domain_events where type = 'deal.stage_changed' and agency_id = current_setting('test.agency')::uuid),
  true, 'won stage is flagged in the event payload');
select is(
  (select count(*)::int from public.claim_domain_events(500) where agency_id = current_setting('test.agency')::uuid),
  3, 'dispatcher claims pending events');
select is(
  (select count(*)::int from public.claim_domain_events(500) where agency_id = current_setting('test.agency')::uuid),
  0, 'events are dispatched only once');

select * from finish();
rollback;
