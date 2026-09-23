-- 0007 tourism pipeline, stages and deals (the CRM card), with automatic stage history.

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, id)
);

create unique index pipelines_one_default_per_agency on public.pipelines (agency_id) where is_default;

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  pipeline_id uuid not null,
  name text not null check (char_length(name) between 2 and 60),
  position smallint not null,
  color text not null default 'slate' check (color ~ '^[a-z]{3,12}$'),
  -- Semantic key: automations, scoring and reports rely on it, so agencies may rename freely.
  system_key text check (system_key in (
    'new_contact', 'qualifying', 'request_complete', 'quoting', 'quote_ready', 'proposal_sent',
    'followup', 'negotiation', 'booking', 'payment', 'confirmed', 'post_sale', 'lost')),
  is_won boolean not null default false,
  is_lost boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, id),
  unique (pipeline_id, system_key),
  constraint pipeline_stages_pipeline_fk foreign key (agency_id, pipeline_id)
    references public.pipelines (agency_id, id) on delete cascade,
  check (not (is_won and is_lost))
);

create index pipeline_stages_pipeline_position_idx on public.pipeline_stages (pipeline_id, position);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  customer_id uuid not null,
  pipeline_id uuid not null,
  stage_id uuid not null,
  stage_entered_at timestamptz not null default now(),
  assigned_member_id uuid,
  title text not null check (char_length(title) between 2 and 120),
  expected_value_cents bigint check (expected_value_cents >= 0),
  currency char(3) not null default 'BRL',
  lead_score smallint not null default 0 check (lead_score between 0 and 100),
  lost_reason text check (char_length(lost_reason) <= 500),
  won_at timestamptz,
  lost_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, id),
  constraint deals_customer_fk foreign key (agency_id, customer_id)
    references public.customers (agency_id, id) on delete cascade,
  constraint deals_pipeline_fk foreign key (agency_id, pipeline_id)
    references public.pipelines (agency_id, id),
  constraint deals_stage_fk foreign key (agency_id, stage_id)
    references public.pipeline_stages (agency_id, id),
  constraint deals_assigned_member_fk foreign key (agency_id, assigned_member_id)
    references public.agency_members (agency_id, id) on delete set null (assigned_member_id)
);

create index deals_agency_stage_idx on public.deals (agency_id, stage_id, updated_at desc);
create index deals_agency_customer_idx on public.deals (agency_id, customer_id);
create index deals_agency_assigned_idx on public.deals (agency_id, assigned_member_id);

create table public.deal_stage_history (
  id bigint generated always as identity primary key,
  agency_id uuid not null,
  deal_id uuid not null,
  from_stage_id uuid,
  to_stage_id uuid not null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  constraint deal_stage_history_deal_fk foreign key (agency_id, deal_id)
    references public.deals (agency_id, id) on delete cascade
);

create index deal_stage_history_deal_idx on public.deal_stage_history (deal_id, changed_at);
create index deal_stage_history_agency_idx on public.deal_stage_history (agency_id, changed_at);

-- Triggers ---------------------------------------------------------------------------------
create trigger pipelines_set_updated_at before update on public.pipelines
  for each row execute function private.set_updated_at();
create trigger pipelines_prevent_agency_change before update on public.pipelines
  for each row execute function private.prevent_agency_change();
create trigger pipeline_stages_set_updated_at before update on public.pipeline_stages
  for each row execute function private.set_updated_at();
create trigger pipeline_stages_prevent_agency_change before update on public.pipeline_stages
  for each row execute function private.prevent_agency_change();
create trigger deals_set_updated_at before update on public.deals
  for each row execute function private.set_updated_at();
create trigger deals_prevent_agency_change before update on public.deals
  for each row execute function private.prevent_agency_change();

-- The stage must belong to the deal's pipeline; stage changes stamp won/lost/entered dates.
create or replace function private.deals_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_stage public.pipeline_stages%rowtype;
begin
  select * into v_stage from public.pipeline_stages where id = new.stage_id;
  if v_stage.pipeline_id is distinct from new.pipeline_id then
    raise exception 'stage does not belong to the deal pipeline' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    new.stage_entered_at := now();
    new.won_at := case when v_stage.is_won then now() else null end;
    new.lost_at := case when v_stage.is_lost then now() else null end;
  end if;
  return new;
end;
$$;

create trigger deals_before_write before insert or update on public.deals
  for each row execute function private.deals_before_write();

-- History is written by the database itself; users cannot forge it.
create or replace function private.deals_record_stage_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    insert into public.deal_stage_history (agency_id, deal_id, from_stage_id, to_stage_id, changed_by)
    values (new.agency_id, new.id, case when tg_op = 'UPDATE' then old.stage_id end, new.stage_id, (select auth.uid()));
  end if;
  return null;
end;
$$;

revoke all on function private.deals_record_stage_history() from public, anon, authenticated;

create trigger deals_record_stage_history after insert or update on public.deals
  for each row execute function private.deals_record_stage_history();

-- Default tourism pipeline --------------------------------------------------------------------
create or replace function private.seed_default_pipeline(p_agency uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pipeline uuid;
begin
  select id into v_pipeline from public.pipelines where agency_id = p_agency and is_default;
  if v_pipeline is not null then
    return v_pipeline;
  end if;

  insert into public.pipelines (agency_id, name, is_default)
  values (p_agency, 'Vendas de viagens', true)
  returning id into v_pipeline;

  insert into public.pipeline_stages (agency_id, pipeline_id, name, position, color, system_key, is_won, is_lost)
  values
    (p_agency, v_pipeline, 'Novo contato',          1, 'slate',  'new_contact',      false, false),
    (p_agency, v_pipeline, 'Qualificando',          2, 'sky',    'qualifying',       false, false),
    (p_agency, v_pipeline, 'Solicitação completa',  3, 'cyan',   'request_complete', false, false),
    (p_agency, v_pipeline, 'Cotação em andamento',  4, 'teal',   'quoting',          false, false),
    (p_agency, v_pipeline, 'Cotação pronta',        5, 'emerald','quote_ready',      false, false),
    (p_agency, v_pipeline, 'Proposta enviada',      6, 'indigo', 'proposal_sent',    false, false),
    (p_agency, v_pipeline, 'Follow-up',             7, 'violet', 'followup',         false, false),
    (p_agency, v_pipeline, 'Negociação',            8, 'amber',  'negotiation',      false, false),
    (p_agency, v_pipeline, 'Reserva',               9, 'orange', 'booking',          false, false),
    (p_agency, v_pipeline, 'Pagamento',            10, 'lime',   'payment',          false, false),
    (p_agency, v_pipeline, 'Viagem confirmada',    11, 'green',  'confirmed',        true,  false),
    (p_agency, v_pipeline, 'Pós-venda',            12, 'pink',   'post_sale',        false, false),
    (p_agency, v_pipeline, 'Perdido',              13, 'rose',   'lost',             false, true);

  return v_pipeline;
end;
$$;

revoke all on function private.seed_default_pipeline(uuid) from public, anon, authenticated;

-- Existing agencies get the pipeline now; new ones get it during onboarding.
select private.seed_default_pipeline(id) from public.agencies;

create or replace function public.create_agency_with_owner(
  p_name text,
  p_phone_e164 text default null,
  p_email text default null,
  p_city text default null,
  p_state text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_agency uuid;
  v_base text;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if (select count(*) from public.agency_members where user_id = v_user and role = 'owner') >= 3 then
    raise exception 'agency limit reached' using errcode = 'P0001';
  end if;

  v_base := trim(both '-' from regexp_replace(
    translate(lower(p_name), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then
    v_base := 'agencia';
  end if;

  insert into public.agencies (name, slug, phone_e164, email, city, state)
  values (
    trim(p_name),
    left(v_base, 50) || '-' || substr(md5(gen_random_uuid()::text), 1, 6),
    nullif(p_phone_e164, ''),
    nullif(lower(p_email), ''),
    nullif(trim(p_city), ''),
    nullif(upper(p_state), '')
  )
  returning id into v_agency;

  insert into public.agency_settings (agency_id) values (v_agency);
  insert into public.agency_members (agency_id, user_id, role, status) values (v_agency, v_user, 'owner', 'active');
  update public.agencies set onboarding_completed_steps = '{1}' where id = v_agency;
  perform private.seed_default_pipeline(v_agency);
  perform private.log_audit(v_agency, 'agency.created', 'agency', v_agency, '{}'::jsonb);

  return v_agency;
end;
$$;

-- RLS ----------------------------------------------------------------------------------------
alter table public.pipelines enable row level security;
alter table public.pipelines force row level security;
alter table public.pipeline_stages enable row level security;
alter table public.pipeline_stages force row level security;
alter table public.deals enable row level security;
alter table public.deals force row level security;
alter table public.deal_stage_history enable row level security;
alter table public.deal_stage_history force row level security;

create policy pipelines_select on public.pipelines for select to authenticated
  using ((select private.is_member(agency_id)));
create policy pipelines_write on public.pipelines for update to authenticated
  using ((select private.has_role(agency_id, '{owner,manager}')))
  with check ((select private.has_role(agency_id, '{owner,manager}')));

create policy pipeline_stages_select on public.pipeline_stages for select to authenticated
  using ((select private.is_member(agency_id)));
create policy pipeline_stages_insert on public.pipeline_stages for insert to authenticated
  with check ((select private.has_role(agency_id, '{owner,manager}')));
create policy pipeline_stages_update on public.pipeline_stages for update to authenticated
  using ((select private.has_role(agency_id, '{owner,manager}')))
  with check ((select private.has_role(agency_id, '{owner,manager}')));

create policy deals_select on public.deals for select to authenticated
  using ((select private.is_member(agency_id)));
create policy deals_insert on public.deals for insert to authenticated
  with check ((select private.has_role(agency_id, '{owner,manager,consultant,attendant}')));
create policy deals_update on public.deals for update to authenticated
  using ((select private.has_role(agency_id, '{owner,manager,consultant,attendant}')))
  with check ((select private.has_role(agency_id, '{owner,manager,consultant,attendant}')));

create policy deal_stage_history_select on public.deal_stage_history for select to authenticated
  using ((select private.is_member(agency_id)));

revoke all on table public.pipelines, public.pipeline_stages, public.deals, public.deal_stage_history from anon;
revoke insert, update, delete on table public.deal_stage_history from authenticated;
