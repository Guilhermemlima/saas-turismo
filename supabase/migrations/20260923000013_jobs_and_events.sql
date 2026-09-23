-- 0013 background jobs (Postgres queue), domain events (outbox) and the minute cron trigger.
-- Only the service role touches these tables: no RLS policies are granted to users.

create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'dead');

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies (id) on delete cascade,
  type text not null check (type ~ '^[a-z][a-z0-9_.]{2,60}$'),
  payload jsonb not null default '{}'::jsonb,
  status public.job_status not null default 'queued',
  priority smallint not null default 100,
  run_at timestamptz not null default now(),
  attempts smallint not null default 0,
  max_attempts smallint not null default 5 check (max_attempts between 1 and 20),
  dedupe_key text check (char_length(dedupe_key) <= 200),
  locked_by text,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index jobs_ready_idx on public.jobs (status, run_at, priority) where status in ('queued', 'running');
-- Dedupe/debounce: one pending job per key.
create unique index jobs_pending_dedupe_uidx on public.jobs (dedupe_key) where status in ('queued', 'running') and dedupe_key is not null;
create index jobs_dead_idx on public.jobs (finished_at desc) where status = 'dead';

create table public.domain_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  type text not null check (type ~ '^[a-z][a-z_]*\.[a-z_]+$'),
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  actor_type public.actor_type not null default 'user',
  actor_id uuid,
  occurred_at timestamptz not null default now(),
  dispatched_at timestamptz
);

create index domain_events_pending_idx on public.domain_events (occurred_at) where dispatched_at is null;
create index domain_events_agency_idx on public.domain_events (agency_id, occurred_at desc);

alter table public.jobs enable row level security;
alter table public.jobs force row level security;
alter table public.domain_events enable row level security;
alter table public.domain_events force row level security;
revoke all on table public.jobs, public.domain_events from anon, authenticated;

-- Overdue alerts are sent once per task.
alter table public.tasks add column overdue_notified_at timestamptz;

-- Queue API (service role only) ----------------------------------------------------------------
create or replace function public.enqueue_job(
  p_type text,
  p_payload jsonb default '{}'::jsonb,
  p_agency_id uuid default null,
  p_run_at timestamptz default now(),
  p_dedupe_key text default null,
  p_max_attempts smallint default 5,
  p_priority smallint default 100
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.jobs (type, payload, agency_id, run_at, dedupe_key, max_attempts, priority)
  values (p_type, coalesce(p_payload, '{}'::jsonb), p_agency_id, coalesce(p_run_at, now()), p_dedupe_key, p_max_attempts, p_priority)
  on conflict (dedupe_key) where status in ('queued', 'running') and dedupe_key is not null do nothing
  returning id into v_id;
  return v_id; -- null when an equivalent job is already pending
end;
$$;

/** Claims ready jobs; locks older than p_lock_seconds are considered abandoned (crashed run). */
create or replace function public.claim_jobs(p_worker text, p_limit integer default 10, p_lock_seconds integer default 120)
returns setof public.jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.jobs j
  set status = 'running', locked_by = p_worker, locked_at = now(), attempts = j.attempts + 1
  where j.id in (
    select id from public.jobs
    where (status = 'queued' and run_at <= now())
       or (status = 'running' and locked_at < now() - make_interval(secs => p_lock_seconds))
    order by priority, run_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  returning j.*;
end;
$$;

create or replace function public.complete_job(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.jobs set status = 'succeeded', finished_at = now(), locked_by = null, locked_at = null, last_error = null
  where id = p_id;
$$;

/** Retryable errors back off exponentially (30s, 1m, 2m, 4m… capped at 1h, with jitter); then dead-letter. */
create or replace function public.fail_job(p_id uuid, p_error text, p_retryable boolean default true)
returns public.job_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
  v_status public.job_status;
begin
  select * into v_job from public.jobs where id = p_id for update;
  if v_job.id is null then
    return null;
  end if;

  if p_retryable and v_job.attempts < v_job.max_attempts then
    v_status := 'queued';
    update public.jobs
    set status = v_status, locked_by = null, locked_at = null, last_error = left(p_error, 2000),
        run_at = now() + least(interval '1 hour', interval '30 seconds' * power(2, greatest(v_job.attempts - 1, 0)))
                       + make_interval(secs => floor(random() * 10))
    where id = p_id;
  else
    v_status := case when p_retryable then 'dead' else 'failed' end;
    update public.jobs
    set status = v_status, locked_by = null, locked_at = null, last_error = left(p_error, 2000), finished_at = now()
    where id = p_id;
  end if;
  return v_status;
end;
$$;

/** Hands a batch of undispatched events to the dispatcher, marking them dispatched atomically. */
create or replace function public.claim_domain_events(p_limit integer default 100)
returns setof public.domain_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.domain_events e
  set dispatched_at = now()
  where e.id in (
    select id from public.domain_events
    where dispatched_at is null
    order by occurred_at
    limit greatest(1, least(p_limit, 500))
    for update skip locked
  )
  returning e.*;
end;
$$;

revoke all on function public.enqueue_job(text, jsonb, uuid, timestamptz, text, smallint, smallint) from public, anon, authenticated;
revoke all on function public.claim_jobs(text, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_job(uuid) from public, anon, authenticated;
revoke all on function public.fail_job(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.claim_domain_events(integer) from public, anon, authenticated;
grant execute on function public.enqueue_job(text, jsonb, uuid, timestamptz, text, smallint, smallint) to service_role;
grant execute on function public.claim_jobs(text, integer, integer) to service_role;
grant execute on function public.complete_job(uuid) to service_role;
grant execute on function public.fail_job(uuid, text, boolean) to service_role;
grant execute on function public.claim_domain_events(integer) to service_role;

-- Domain events, written in the same transaction as the state change -------------------------------
create or replace function private.emit_event(p_agency uuid, p_type text, p_aggregate_type text, p_aggregate_id uuid, p_payload jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.domain_events (agency_id, type, aggregate_type, aggregate_id, payload, actor_type, actor_id)
  values (p_agency, p_type, p_aggregate_type, p_aggregate_id, coalesce(p_payload, '{}'::jsonb),
          case when (select auth.uid()) is null then 'system' else 'user' end::public.actor_type, (select auth.uid()));
$$;

revoke all on function private.emit_event(uuid, text, text, uuid, jsonb) from public, anon, authenticated;

create or replace function private.deals_emit_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.emit_event(new.agency_id, 'deal.created', 'deal', new.id, jsonb_build_object('stage_id', new.stage_id));
  elsif new.stage_id is distinct from old.stage_id then
    perform private.emit_event(new.agency_id, 'deal.stage_changed', 'deal', new.id,
      jsonb_build_object('from_stage_id', old.stage_id, 'to_stage_id', new.stage_id, 'won', new.won_at is not null, 'lost', new.lost_at is not null));
  end if;
  return null;
end;
$$;

create or replace function private.travel_requests_emit_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'complete' and (tg_op = 'INSERT' or old.status is distinct from 'complete') then
    perform private.emit_event(new.agency_id, 'travel_request.completed', 'travel_request', new.id, jsonb_build_object('deal_id', new.deal_id));
  end if;
  return null;
end;
$$;

create or replace function private.messages_emit_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.direction = 'inbound' then
    perform private.emit_event(new.agency_id, 'customer.replied', 'conversation', new.conversation_id, jsonb_build_object('message_id', new.id));
  end if;
  return null;
end;
$$;

revoke all on function private.deals_emit_events() from public, anon, authenticated;
revoke all on function private.travel_requests_emit_events() from public, anon, authenticated;
revoke all on function private.messages_emit_events() from public, anon, authenticated;

create trigger deals_emit_events after insert or update of stage_id on public.deals
  for each row execute function private.deals_emit_events();
create trigger travel_requests_emit_events after insert or update of status on public.travel_requests
  for each row execute function private.travel_requests_emit_events();
create trigger messages_emit_events after insert on public.messages
  for each row execute function private.messages_emit_events();

-- Minute trigger (Supabase only). The endpoint URL and bearer secret live in Supabase Vault
-- (`jobs_endpoint`, `cron_secret`), never in this repository. -------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net with schema extensions;

    perform cron.unschedule(jobid) from cron.job where jobname = 'process-jobs';
    perform cron.schedule(
      'process-jobs',
      '* * * * *',
      $cron$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'jobs_endpoint'),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 55000
        )
        where exists (select 1 from vault.decrypted_secrets where name = 'jobs_endpoint')
          and exists (select 1 from vault.decrypted_secrets where name = 'cron_secret');
      $cron$
    );
  end if;
end;
$$;
