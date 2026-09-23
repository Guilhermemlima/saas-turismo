-- 0009 agency profile (specialties), team invitations, last-owner protection, onboarding steps.

-- Specialties reuse the travel enums (a honeymoon agency can be national and international).
alter table public.agencies
  add column specialties public.trip_type[] not null default '{}',
  add column specialty_scopes public.trip_scope[] not null default '{}';

-- Team pages show e-mails; auth.users is not readable by clients, so profiles keep a copy.
alter table public.profiles add column email text check (char_length(email) <= 254);
update public.profiles p set email = u.email from auth.users u where u.id = p.id;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), lower(new.email));
  return new;
end;
$$;

create or replace function private.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.sync_profile_email();

-- An agency must always keep at least one active owner. ------------------------------------------
create or replace function private.protect_last_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active')
     and not exists (
       select 1 from public.agency_members m
       where m.agency_id = old.agency_id and m.id <> old.id and m.role = 'owner' and m.status = 'active'
     ) then
    raise exception 'agency must keep at least one active owner' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger agency_members_protect_last_owner
  before update of role, status or delete on public.agency_members
  for each row execute function private.protect_last_owner();

-- Invitations ------------------------------------------------------------------------------------
create table public.agency_invitations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 254),
  role public.agency_role not null,
  -- SHA-256 (hex) of a 256-bit random token; the token itself is never stored.
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  invited_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index agency_invitations_agency_idx on public.agency_invitations (agency_id, created_at desc);
create unique index agency_invitations_one_pending_per_email
  on public.agency_invitations (agency_id, email) where accepted_at is null and revoked_at is null;

create trigger agency_invitations_prevent_agency_change before update on public.agency_invitations
  for each row execute function private.prevent_agency_change();

alter table public.agency_invitations enable row level security;
alter table public.agency_invitations force row level security;

create policy agency_invitations_select on public.agency_invitations for select to authenticated
  using ((select private.has_role(agency_id, '{owner,manager}')));

-- Managers may invite anyone except owners; only owners can invite owners.
create policy agency_invitations_insert on public.agency_invitations for insert to authenticated
  with check (
    invited_by = (select auth.uid())
    and (
      (select private.has_role(agency_id, '{owner}'))
      or ((select private.has_role(agency_id, '{manager}')) and role <> 'owner')
    )
  );

create policy agency_invitations_update on public.agency_invitations for update to authenticated
  using ((select private.has_role(agency_id, '{owner,manager}')))
  with check ((select private.has_role(agency_id, '{owner,manager}')));

revoke all on table public.agency_invitations from anon;

/** What the invitee sees before accepting. Never exposes the inviter's agency data beyond its name. */
create or replace function public.get_invitation(p_token_hash text)
returns table (agency_name text, role public.agency_role, email text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.name, i.role, i.email,
    case
      when i.revoked_at is not null then 'revoked'
      when i.accepted_at is not null then 'accepted'
      when i.expires_at < now() then 'expired'
      else 'pending'
    end
  from public.agency_invitations i
  join public.agencies a on a.id = i.agency_id
  where i.token_hash = p_token_hash and (select auth.uid()) is not null;
$$;

create or replace function public.accept_invitation(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text;
  v_invite public.agency_invitations%rowtype;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_invite from public.agency_invitations where token_hash = p_token_hash for update;
  if v_invite.id is null or v_invite.revoked_at is not null or v_invite.accepted_at is not null or v_invite.expires_at < now() then
    raise exception 'invitation is not valid' using errcode = 'P0002';
  end if;

  -- A forwarded link is useless: the invitation only works for the invited e-mail.
  select lower(email) into v_email from auth.users where id = v_user;
  if v_email is distinct from v_invite.email then
    raise exception 'invitation belongs to another e-mail' using errcode = '42501';
  end if;

  insert into public.agency_members (agency_id, user_id, role, status)
  values (v_invite.agency_id, v_user, v_invite.role, 'active')
  on conflict (agency_id, user_id) do update set role = excluded.role, status = 'active';

  update public.agency_invitations set accepted_at = now(), accepted_by = v_user where id = v_invite.id;

  insert into public.audit_logs (agency_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
  values (v_invite.agency_id, 'user', v_user, 'member.joined', 'agency_invitation', v_invite.id,
          jsonb_build_object('role', v_invite.role));

  return v_invite.agency_id;
end;
$$;

revoke all on function public.get_invitation(text) from public, anon;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.get_invitation(text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;

-- Onboarding progress ----------------------------------------------------------------------------
-- Steps 1–4: agency data, team, specialties, business hours. Managers can complete steps even
-- though only owners may edit the agencies row directly.
create or replace function public.mark_onboarding_step(p_agency uuid, p_step smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role(p_agency, '{owner,manager}') then
    raise exception 'insufficient role' using errcode = '42501';
  end if;
  if p_step not between 1 and 8 then
    raise exception 'invalid onboarding step' using errcode = '22023';
  end if;

  update public.agencies
  set onboarding_completed_steps = (
        select array_agg(distinct s order by s) from unnest(onboarding_completed_steps || p_step) as s
      ),
      onboarding_completed_at = case
        when onboarding_completed_at is null and '{1,2,3,4}'::smallint[] <@ (onboarding_completed_steps || p_step)
        then now() else onboarding_completed_at end
  where id = p_agency;
end;
$$;

revoke all on function public.mark_onboarding_step(uuid, smallint) from public, anon;
grant execute on function public.mark_onboarding_step(uuid, smallint) to authenticated;

-- Role/status changes are audited by the database itself (users cannot write audit_logs).
create or replace function private.audit_member_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role or new.status is distinct from old.status then
    insert into public.audit_logs (agency_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
    values (new.agency_id, 'user', (select auth.uid()), 'member.updated', 'agency_member', new.id,
            jsonb_build_object('from_role', old.role, 'to_role', new.role, 'from_status', old.status, 'to_status', new.status));
  end if;
  return null;
end;
$$;

revoke all on function private.audit_member_change() from public, anon, authenticated;

create trigger agency_members_audit after update on public.agency_members
  for each row execute function private.audit_member_change();
