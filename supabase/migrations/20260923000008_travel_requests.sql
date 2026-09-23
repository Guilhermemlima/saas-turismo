-- 0008 travel requests: what the traveler wants (1:1 with a deal for now).

create type public.trip_scope as enum ('national', 'international');
create type public.trip_type as enum (
  'leisure', 'honeymoon', 'family', 'couple', 'solo', 'corporate', 'cruise', 'disney',
  'exchange', 'excursion', 'package', 'custom');
create type public.travel_request_status as enum ('collecting', 'complete', 'archived', 'cancelled');
create type public.date_flexibility as enum ('exact', 'flexible_days', 'month_only', 'undecided');
create type public.meal_plan as enum ('room_only', 'breakfast', 'half_board', 'full_board', 'all_inclusive');
create type public.budget_scope as enum ('total', 'per_person');

create table public.travel_requests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  deal_id uuid not null,
  customer_id uuid not null,
  status public.travel_request_status not null default 'collecting',

  origin_city text check (char_length(origin_city) <= 120),
  destination text check (char_length(destination) <= 160),
  trip_scope public.trip_scope,
  trip_types public.trip_type[] not null default '{}',

  date_flexibility public.date_flexibility not null default 'undecided',
  departure_date date,
  return_date date,
  travel_month date check (travel_month is null or extract(day from travel_month) = 1),
  nights smallint generated always as ((return_date - departure_date)::smallint) stored,

  adults smallint check (adults between 1 and 99),
  children_ages smallint[] not null default '{}'
    check (cardinality(children_ages) <= 20 and 0 <= all (children_ages) and 17 >= all (children_ages)),
  children smallint generated always as (cardinality(children_ages)::smallint) stored,
  infants smallint not null default 0 check (infants between 0 and 20),

  budget_cents bigint check (budget_cents >= 0),
  budget_currency char(3) not null default 'BRL',
  budget_scope public.budget_scope,

  needs_flights boolean not null default false,
  needs_hotel boolean not null default false,
  needs_transfer boolean not null default false,
  needs_insurance boolean not null default false,
  needs_tours boolean not null default false,

  hotel_category smallint check (hotel_category between 1 and 5),
  rooms smallint check (rooms between 1 and 50),
  meal_plan public.meal_plan,

  special_requests text check (char_length(special_requests) <= 2000),
  notes text check (char_length(notes) <= 4000),
  completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (agency_id, id),
  unique (deal_id),
  constraint travel_requests_deal_fk foreign key (agency_id, deal_id)
    references public.deals (agency_id, id) on delete cascade,
  constraint travel_requests_customer_fk foreign key (agency_id, customer_id)
    references public.customers (agency_id, id) on delete cascade,
  constraint travel_requests_dates_order check (return_date is null or departure_date is null or return_date >= departure_date)
);

create index travel_requests_agency_status_idx on public.travel_requests (agency_id, status, updated_at desc);
create index travel_requests_agency_customer_idx on public.travel_requests (agency_id, customer_id);
create index travel_requests_agency_departure_idx on public.travel_requests (agency_id, departure_date);

create trigger travel_requests_set_updated_at before update on public.travel_requests
  for each row execute function private.set_updated_at();
create trigger travel_requests_prevent_agency_change before update on public.travel_requests
  for each row execute function private.prevent_agency_change();

-- The request and its deal must refer to the same traveler.
create or replace function private.travel_requests_check_customer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.deals d where d.id = new.deal_id and d.customer_id = new.customer_id) then
    raise exception 'travel request customer must match the deal customer' using errcode = '23514';
  end if;
  if new.status = 'complete' and (tg_op = 'INSERT' or old.status is distinct from 'complete') then
    new.completed_at := now();
  elsif new.status <> 'complete' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger travel_requests_check_customer before insert or update on public.travel_requests
  for each row execute function private.travel_requests_check_customer();

alter table public.travel_requests enable row level security;
alter table public.travel_requests force row level security;

create policy travel_requests_select on public.travel_requests for select to authenticated
  using ((select private.is_member(agency_id)));
create policy travel_requests_insert on public.travel_requests for insert to authenticated
  with check ((select private.has_role(agency_id, '{owner,manager,consultant,attendant}')));
create policy travel_requests_update on public.travel_requests for update to authenticated
  using ((select private.has_role(agency_id, '{owner,manager,consultant,attendant}')))
  with check ((select private.has_role(agency_id, '{owner,manager,consultant,attendant}')));

revoke all on table public.travel_requests from anon;

/*
 * Creates the deal (CRM card) and its travel request in one transaction. SECURITY INVOKER:
 * every insert runs under the caller's RLS, so the tenant checks above still apply.
 * p_request carries only request columns already validated by the application (Zod).
 */
create or replace function public.create_travel_request(
  p_customer_id uuid,
  p_title text,
  p_stage_key text,
  p_assigned_member_id uuid,
  p_request jsonb
)
returns table (deal_id uuid, travel_request_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_agency uuid;
  v_pipeline uuid;
  v_stage uuid;
  v_deal uuid;
  v_request uuid;
  r public.travel_requests;
begin
  select c.agency_id into v_agency from public.customers c where c.id = p_customer_id and c.archived_at is null;
  if v_agency is null then
    raise exception 'customer not found' using errcode = 'P0002';
  end if;

  select p.id into v_pipeline from public.pipelines p where p.agency_id = v_agency and p.is_default;
  select s.id into v_stage from public.pipeline_stages s where s.pipeline_id = v_pipeline and s.system_key = p_stage_key;
  if v_stage is null then
    raise exception 'pipeline stage % not found', p_stage_key using errcode = 'P0002';
  end if;

  insert into public.deals (agency_id, customer_id, pipeline_id, stage_id, assigned_member_id, title, created_by)
  values (v_agency, p_customer_id, v_pipeline, v_stage, p_assigned_member_id, p_title, (select auth.uid()))
  returning id into v_deal;

  r := jsonb_populate_record(null::public.travel_requests, p_request);

  insert into public.travel_requests (
    agency_id, deal_id, customer_id, status, origin_city, destination, trip_scope, trip_types,
    date_flexibility, departure_date, return_date, travel_month, adults, children_ages, infants,
    budget_cents, budget_currency, budget_scope, needs_flights, needs_hotel, needs_transfer,
    needs_insurance, needs_tours, hotel_category, rooms, meal_plan, special_requests, notes, created_by)
  values (
    v_agency, v_deal, p_customer_id, coalesce(r.status, 'collecting'), r.origin_city, r.destination, r.trip_scope,
    coalesce(r.trip_types, '{}'), coalesce(r.date_flexibility, 'undecided'), r.departure_date, r.return_date,
    r.travel_month, r.adults, coalesce(r.children_ages, '{}'), coalesce(r.infants, 0), r.budget_cents,
    coalesce(r.budget_currency, 'BRL'), r.budget_scope, coalesce(r.needs_flights, false),
    coalesce(r.needs_hotel, false), coalesce(r.needs_transfer, false), coalesce(r.needs_insurance, false),
    coalesce(r.needs_tours, false), r.hotel_category, r.rooms, r.meal_plan, r.special_requests, r.notes,
    (select auth.uid()))
  returning id into v_request;

  return query select v_deal, v_request;
end;
$$;

revoke all on function public.create_travel_request(uuid, text, text, uuid, jsonb) from public, anon;
grant execute on function public.create_travel_request(uuid, text, text, uuid, jsonb) to authenticated;
