-- 0003 agencies, settings, members, platform admins and the RLS helper functions.

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  cnpj text check (cnpj ~ '^[0-9]{14}$'),
  phone_e164 text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (char_length(email) <= 254),
  website text check (char_length(website) <= 300),
  instagram text check (char_length(instagram) <= 60),
  logo_path text,
  city text check (char_length(city) <= 120),
  state char(2),
  country char(2) not null default 'BR',
  status public.agency_status not null default 'trial',
  onboarding_completed_steps smallint[] not null default '{}',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger agencies_set_updated_at
  before update on public.agencies
  for each row execute function private.set_updated_at();

create table public.agency_settings (
  agency_id uuid primary key references public.agencies (id) on delete cascade,
  timezone text not null default 'America/Sao_Paulo',
  currency char(3) not null default 'BRL',
  business_hours jsonb not null default '{}'::jsonb,
  temperature_thresholds jsonb not null default '{"warm": 31, "hot": 61}'::jsonb,
  consultant_visibility text not null default 'all' check (consultant_visibility in ('all', 'own')),
  updated_at timestamptz not null default now()
);

create trigger agency_settings_set_updated_at
  before update on public.agency_settings
  for each row execute function private.set_updated_at();
create trigger agency_settings_prevent_agency_change
  before update on public.agency_settings
  for each row execute function private.prevent_agency_change();

create table public.agency_members (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.agency_role not null,
  status public.member_status not null default 'active',
  display_name text check (char_length(display_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, user_id),
  unique (agency_id, id)
);

create index agency_members_user_id_idx on public.agency_members (user_id);

create trigger agency_members_set_updated_at
  before update on public.agency_members
  for each row execute function private.set_updated_at();
create trigger agency_members_prevent_agency_change
  before update on public.agency_members
  for each row execute function private.prevent_agency_change();

create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- RLS helper functions ------------------------------------------------------------
-- security definer so policies can read membership without recursive RLS evaluation.

-- Membership only (used for agency-level tables so a suspended agency can still see its status).
create or replace function private.is_member_of(p_agency uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.agency_members m
    where m.agency_id = p_agency
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

-- Membership in an operational (trial/active) agency: used for all business data.
create or replace function private.is_member(p_agency uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.agency_members m
    join public.agencies a on a.id = m.agency_id
    where m.agency_id = p_agency
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and a.status in ('trial', 'active')
  );
$$;

create or replace function private.has_role(p_agency uuid, p_roles public.agency_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.agency_members m
    join public.agencies a on a.id = m.agency_id
    where m.agency_id = p_agency
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any (p_roles)
      and a.status in ('trial', 'active')
  );
$$;

create or replace function private.shares_agency_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.agency_members me
    join public.agency_members other on other.agency_id = me.agency_id
    where me.user_id = (select auth.uid())
      and me.status = 'active'
      and other.user_id = p_user
  );
$$;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;

revoke all on function private.is_member_of(uuid) from public, anon;
revoke all on function private.is_member(uuid) from public, anon;
revoke all on function private.has_role(uuid, public.agency_role[]) from public, anon;
revoke all on function private.shares_agency_with(uuid) from public, anon;
revoke all on function private.is_platform_admin() from public, anon;
grant execute on function private.is_member_of(uuid) to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_role(uuid, public.agency_role[]) to authenticated;
grant execute on function private.shares_agency_with(uuid) to authenticated;
grant execute on function private.is_platform_admin() to authenticated;

-- RLS ----------------------------------------------------------------------------------
alter table public.agencies enable row level security;
alter table public.agencies force row level security;
alter table public.agency_settings enable row level security;
alter table public.agency_settings force row level security;
alter table public.agency_members enable row level security;
alter table public.agency_members force row level security;
alter table public.platform_admins enable row level security;
alter table public.platform_admins force row level security;
-- platform_admins: no policies → only the service role can read/write it.

-- agencies: created only through create_agency_with_owner(); never deleted via the API.
create policy agencies_select on public.agencies
  for select to authenticated
  using ((select private.is_member_of(id)));

create policy agencies_update on public.agencies
  for update to authenticated
  using ((select private.has_role(id, '{owner}')))
  with check ((select private.has_role(id, '{owner}')));

-- The commercial status (trial/active/suspended) is a platform decision, never an owner edit.
create or replace function private.protect_agency_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and current_user not in ('service_role', 'postgres') then
    raise exception 'agency status can only be changed by the platform' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger agencies_protect_status
  before update on public.agencies
  for each row execute function private.protect_agency_status();

create policy agency_settings_select on public.agency_settings
  for select to authenticated
  using ((select private.is_member_of(agency_id)));

create policy agency_settings_update on public.agency_settings
  for update to authenticated
  using ((select private.has_role(agency_id, '{owner,manager}')))
  with check ((select private.has_role(agency_id, '{owner,manager}')));

create policy agency_members_select on public.agency_members
  for select to authenticated
  using ((select private.is_member_of(agency_id)));

-- Managers can manage non-owner members; only owners can create/alter owners.
create policy agency_members_insert on public.agency_members
  for insert to authenticated
  with check (
    (select private.has_role(agency_id, '{owner}'))
    or ((select private.has_role(agency_id, '{manager}')) and role <> 'owner')
  );

create policy agency_members_update on public.agency_members
  for update to authenticated
  using (
    (select private.has_role(agency_id, '{owner}'))
    or ((select private.has_role(agency_id, '{manager}')) and role <> 'owner')
  )
  with check (
    (select private.has_role(agency_id, '{owner}'))
    or ((select private.has_role(agency_id, '{manager}')) and role <> 'owner')
  );

create policy agency_members_delete on public.agency_members
  for delete to authenticated
  using ((select private.has_role(agency_id, '{owner}')) and user_id <> (select auth.uid()));

-- profiles: see yourself and teammates; edit only yourself.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.shares_agency_with(id)));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
