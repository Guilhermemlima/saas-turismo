-- 0004 append-only audit log and the atomic agency creation RPC used by onboarding.

create table public.audit_logs (
  id bigint generated always as identity primary key,
  agency_id uuid references public.agencies (id) on delete cascade,
  actor_type public.actor_type not null,
  actor_id uuid,
  action text not null check (char_length(action) <= 80),
  entity_type text check (char_length(entity_type) <= 60),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_agency_created_idx on public.audit_logs (agency_id, created_at desc);

alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;

-- Readable by owners/managers of the agency. No insert/update/delete policies:
-- rows are written only by security definer functions or the service role.
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (agency_id is not null and (select private.has_role(agency_id, '{owner,manager}')));

create or replace function private.log_audit(
  p_agency uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (agency_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
  values (p_agency, 'user', (select auth.uid()), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;

-- Callable only from other security definer functions (owner privileges), never directly by users.
revoke all on function private.log_audit(uuid, text, text, uuid, jsonb) from public, anon, authenticated;

-- Atomic onboarding: agency + settings + owner membership in a single transaction.
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

  -- Abuse guard: a single user cannot spin up unlimited tenants.
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

  insert into public.agency_members (agency_id, user_id, role, status)
  values (v_agency, v_user, 'owner', 'active');

  update public.agencies set onboarding_completed_steps = '{1}' where id = v_agency;

  perform private.log_audit(v_agency, 'agency.created', 'agency', v_agency, '{}'::jsonb);

  return v_agency;
end;
$$;

revoke all on function public.create_agency_with_owner(text, text, text, text, text) from public, anon;
grant execute on function public.create_agency_with_owner(text, text, text, text, text) to authenticated;
