-- 0005 customers (travelers' main record) with tenant-safe composite foreign keys.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone_e164 text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (char_length(email) <= 254),
  city text check (char_length(city) <= 120),
  state char(2),
  country char(2) not null default 'BR',
  birth_date date check (birth_date > date '1900-01-01'),
  source public.customer_source not null default 'manual',
  owner_member_id uuid,
  notes text check (char_length(notes) <= 2000),
  marketing_opt_in boolean not null default false,
  last_contact_at timestamptz,
  archived_at timestamptz,
  anonymized_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, id),
  constraint customers_contact_required check (phone_e164 is not null or email is not null),
  -- Composite FK: the responsible consultant must belong to the same agency.
  constraint customers_owner_member_fk foreign key (agency_id, owner_member_id)
    references public.agency_members (agency_id, id) on delete set null (owner_member_id)
);

create unique index customers_agency_phone_uidx
  on public.customers (agency_id, phone_e164)
  where phone_e164 is not null and anonymized_at is null;
create index customers_agency_created_idx on public.customers (agency_id, created_at desc);
create index customers_agency_name_idx on public.customers (agency_id, lower(full_name));
create index customers_agency_owner_idx on public.customers (agency_id, owner_member_id);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function private.set_updated_at();
create trigger customers_prevent_agency_change
  before update on public.customers
  for each row execute function private.prevent_agency_change();

-- Archiving/restoring is restricted to owners and managers even though other roles may edit.
create or replace function private.guard_customer_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.archived_at is distinct from old.archived_at
     and current_user not in ('service_role', 'postgres')
     and not private.has_role(new.agency_id, '{owner,manager}') then
    raise exception 'insufficient role to archive customers' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger customers_guard_archive
  before update on public.customers
  for each row execute function private.guard_customer_archive();

alter table public.customers enable row level security;
alter table public.customers force row level security;

create policy customers_select on public.customers
  for select to authenticated
  using ((select private.is_member(agency_id)));

create policy customers_insert on public.customers
  for insert to authenticated
  with check ((select private.has_role(agency_id, '{owner,manager,consultant,attendant}')));

create policy customers_update on public.customers
  for update to authenticated
  using ((select private.has_role(agency_id, '{owner,manager,consultant,attendant}')))
  with check ((select private.has_role(agency_id, '{owner,manager,consultant,attendant}')));

-- No delete policy: hard deletion only through the LGPD flow (service role).
