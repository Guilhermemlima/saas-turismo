-- 0014 quotes: quote → options → items. Totals are computed by the database (never trusted from clients).

create type public.quote_status as enum ('draft', 'ready', 'archived');
create type public.quote_item_type as enum ('flight', 'hotel', 'transfer', 'tour', 'insurance', 'other');

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  deal_id uuid not null,
  customer_id uuid not null,
  travel_request_id uuid,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  status public.quote_status not null default 'draft',
  currency char(3) not null default 'BRL' check (currency in ('BRL', 'USD', 'EUR')),
  internal_notes text check (char_length(internal_notes) <= 4000),
  assigned_member_id uuid,
  ready_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, id),
  constraint quotes_deal_fk foreign key (agency_id, deal_id) references public.deals (agency_id, id) on delete cascade,
  constraint quotes_customer_fk foreign key (agency_id, customer_id) references public.customers (agency_id, id) on delete cascade,
  constraint quotes_travel_request_fk foreign key (agency_id, travel_request_id) references public.travel_requests (agency_id, id) on delete set null (travel_request_id),
  constraint quotes_assigned_member_fk foreign key (agency_id, assigned_member_id) references public.agency_members (agency_id, id) on delete set null (assigned_member_id)
);

create index quotes_agency_status_idx on public.quotes (agency_id, status, updated_at desc);
create index quotes_agency_deal_idx on public.quotes (agency_id, deal_id);

create table public.quote_options (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  quote_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (char_length(description) <= 2000),
  position smallint not null default 1,
  service_fee_cents bigint not null default 0 check (service_fee_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  -- Aggregates maintained by triggers from quote_items.
  items_price_cents bigint not null default 0,
  items_cost_cents bigint not null default 0,
  markup_cents bigint not null default 0,
  fees_cents bigint not null default 0,
  commission_cents bigint not null default 0,
  total_cents bigint not null default 0,
  margin_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, id),
  constraint quote_options_quote_fk foreign key (agency_id, quote_id) references public.quotes (agency_id, id) on delete cascade,
  constraint quote_options_total_not_negative check (total_cents >= 0)
);

create index quote_options_quote_idx on public.quote_options (quote_id, position);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  option_id uuid not null,
  item_type public.quote_item_type not null,
  position smallint not null default 1,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text check (char_length(description) <= 2000),
  supplier_name text check (char_length(supplier_name) <= 120),
  start_date date,
  end_date date,
  quantity smallint not null default 1 check (quantity between 1 and 999),
  -- Unit amounts: supplier net cost, agency markup, pass-through fees (taxes). Commission is the
  -- total the supplier pays the agency for this line (never charged to the customer).
  unit_cost_cents bigint not null default 0 check (unit_cost_cents >= 0),
  unit_markup_cents bigint not null default 0 check (unit_markup_cents >= 0),
  unit_fees_cents bigint not null default 0 check (unit_fees_cents >= 0),
  commission_cents bigint not null default 0 check (commission_cents >= 0),
  price_cents bigint generated always as (quantity * (unit_cost_cents + unit_markup_cents + unit_fees_cents)) stored,
  show_price_to_customer boolean not null default true,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_items_option_fk foreign key (agency_id, option_id) references public.quote_options (agency_id, id) on delete cascade,
  constraint quote_items_dates check (end_date is null or start_date is null or end_date >= start_date)
);

create index quote_items_option_idx on public.quote_items (option_id, position);

create trigger quotes_set_updated_at before update on public.quotes for each row execute function private.set_updated_at();
create trigger quotes_prevent_agency_change before update on public.quotes for each row execute function private.prevent_agency_change();
create trigger quote_options_set_updated_at before update on public.quote_options for each row execute function private.set_updated_at();
create trigger quote_options_prevent_agency_change before update on public.quote_options for each row execute function private.prevent_agency_change();
create trigger quote_items_set_updated_at before update on public.quote_items for each row execute function private.set_updated_at();
create trigger quote_items_prevent_agency_change before update on public.quote_items for each row execute function private.prevent_agency_change();

-- A quote must belong to the same traveler as its deal; ready/archived quotes are frozen. -----------
create or replace function private.quotes_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.deals d where d.id = new.deal_id and d.customer_id = new.customer_id) then
    raise exception 'quote customer must match the deal customer' using errcode = '23514';
  end if;
  if new.status = 'ready' and (tg_op = 'INSERT' or old.status is distinct from 'ready') then
    new.ready_at := now();
  elsif new.status = 'draft' then
    new.ready_at := null;
  end if;
  return new;
end;
$$;

create trigger quotes_before_write before insert or update on public.quotes
  for each row execute function private.quotes_before_write();

create or replace function private.assert_quote_editable(p_quote uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.quotes where id = p_quote and status <> 'draft') then
    raise exception 'quote is not a draft; reopen it before editing' using errcode = '55000';
  end if;
end;
$$;

create or replace function private.quote_options_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.assert_quote_editable(new.quote_id);
  if tg_op = 'INSERT' then
    -- A new option has no items yet: aggregates start at zero whatever the client sent.
    new.items_price_cents := 0;
    new.items_cost_cents := 0;
    new.markup_cents := 0;
    new.fees_cents := 0;
    new.commission_cents := 0;
  end if;
  new.total_cents := new.items_price_cents + new.service_fee_cents - new.discount_cents;
  new.margin_cents := new.markup_cents + new.service_fee_cents - new.discount_cents;
  return new;
end;
$$;

create trigger quote_options_before_write before insert or update on public.quote_options
  for each row execute function private.quote_options_before_write();

create or replace function private.quote_options_before_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.assert_quote_editable(old.quote_id);
  return old;
end;
$$;

create trigger quote_options_before_delete before delete on public.quote_options
  for each row execute function private.quote_options_before_delete();

create or replace function private.recalc_quote_option(p_option uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.quote_options o
  set items_price_cents = coalesce(t.price, 0),
      items_cost_cents = coalesce(t.cost, 0),
      markup_cents = coalesce(t.markup, 0),
      fees_cents = coalesce(t.fees, 0),
      commission_cents = coalesce(t.commission, 0)
  from (
    select sum(price_cents) as price, sum(quantity * unit_cost_cents) as cost, sum(quantity * unit_markup_cents) as markup,
           sum(quantity * unit_fees_cents) as fees, sum(commission_cents) as commission
    from public.quote_items where option_id = p_option
  ) t
  where o.id = p_option;
$$;

create or replace function private.quote_items_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_quote uuid;
begin
  select quote_id into v_quote from public.quote_options where id = coalesce(new.option_id, old.option_id);
  perform private.assert_quote_editable(v_quote);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger quote_items_before_write before insert or update or delete on public.quote_items
  for each row execute function private.quote_items_before_write();

create or replace function private.quote_items_after_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.recalc_quote_option(new.option_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and (tg_op = 'DELETE' or old.option_id is distinct from new.option_id) then
    perform private.recalc_quote_option(old.option_id);
  end if;
  return null;
end;
$$;

create trigger quote_items_after_write after insert or update or delete on public.quote_items
  for each row execute function private.quote_items_after_write();

-- Domain events ----------------------------------------------------------------------------------
create or replace function private.quotes_emit_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.emit_event(new.agency_id, 'quote.created', 'quote', new.id, jsonb_build_object('deal_id', new.deal_id));
  elsif new.status = 'ready' and old.status is distinct from 'ready' then
    perform private.emit_event(new.agency_id, 'quote.ready', 'quote', new.id, jsonb_build_object('deal_id', new.deal_id));
  end if;
  return null;
end;
$$;

revoke all on function private.quotes_emit_events() from public, anon, authenticated;

create trigger quotes_emit_events after insert or update of status on public.quotes
  for each row execute function private.quotes_emit_events();

-- RLS: quotes are for owner, manager, consultant (write) and financial (read). ----------------------
alter table public.quotes enable row level security;
alter table public.quotes force row level security;
alter table public.quote_options enable row level security;
alter table public.quote_options force row level security;
alter table public.quote_items enable row level security;
alter table public.quote_items force row level security;

create policy quotes_select on public.quotes for select to authenticated
  using ((select private.has_role(agency_id, '{owner,manager,consultant,financial}')));
create policy quotes_insert on public.quotes for insert to authenticated
  with check ((select private.has_role(agency_id, '{owner,manager,consultant}')));
create policy quotes_update on public.quotes for update to authenticated
  using ((select private.has_role(agency_id, '{owner,manager,consultant}')))
  with check ((select private.has_role(agency_id, '{owner,manager,consultant}')));

create policy quote_options_select on public.quote_options for select to authenticated
  using ((select private.has_role(agency_id, '{owner,manager,consultant,financial}')));
create policy quote_options_insert on public.quote_options for insert to authenticated
  with check ((select private.has_role(agency_id, '{owner,manager,consultant}')));
create policy quote_options_update on public.quote_options for update to authenticated
  using ((select private.has_role(agency_id, '{owner,manager,consultant}')))
  with check ((select private.has_role(agency_id, '{owner,manager,consultant}')));
create policy quote_options_delete on public.quote_options for delete to authenticated
  using ((select private.has_role(agency_id, '{owner,manager,consultant}')));

create policy quote_items_select on public.quote_items for select to authenticated
  using ((select private.has_role(agency_id, '{owner,manager,consultant,financial}')));
create policy quote_items_insert on public.quote_items for insert to authenticated
  with check ((select private.has_role(agency_id, '{owner,manager,consultant}')));
create policy quote_items_update on public.quote_items for update to authenticated
  using ((select private.has_role(agency_id, '{owner,manager,consultant}')))
  with check ((select private.has_role(agency_id, '{owner,manager,consultant}')));
create policy quote_items_delete on public.quote_items for delete to authenticated
  using ((select private.has_role(agency_id, '{owner,manager,consultant}')));

revoke all on table public.quotes, public.quote_options, public.quote_items from anon;
-- Called from the item triggers (running as the user); it only recomputes from real rows, so it is safe.
revoke all on function private.recalc_quote_option(uuid) from public, anon;
grant execute on function private.recalc_quote_option(uuid) to authenticated;

-- Aggregates are written by triggers only: users may update just the editable option columns.
revoke update on table public.quote_options from authenticated;
grant update (title, description, position, service_fee_cents, discount_cents) on public.quote_options to authenticated;
