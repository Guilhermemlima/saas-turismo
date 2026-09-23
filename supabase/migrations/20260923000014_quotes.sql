-- 0014 quotes: a quote belongs to a deal and holds 1..N options, each with typed items.
-- Prices, totals and margin are always computed by the database (the client-sent values are
-- overwritten), mirroring src/modules/quotes/pricing.ts. Attendants cannot read quotes at all.

create type public.quote_status as enum ('draft', 'ready', 'archived');
create type public.quote_item_type as enum ('flight', 'hotel', 'transfer', 'tour', 'insurance', 'other');

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  deal_id uuid not null,
  customer_id uuid not null,
  travel_request_id uuid,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  status public.quote_status not null default 'draft',
  currency char(3) not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  assigned_member_id uuid,
  internal_notes text check (char_length(internal_notes) <= 4000),
  ready_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, id),
  constraint quotes_deal_fk foreign key (agency_id, deal_id) references public.deals (agency_id, id) on delete cascade,
  constraint quotes_customer_fk foreign key (agency_id, customer_id) references public.customers (agency_id, id) on delete cascade,
  constraint quotes_travel_request_fk foreign key (agency_id, travel_request_id)
    references public.travel_requests (agency_id, id) on delete set null (travel_request_id),
  constraint quotes_assigned_member_fk foreign key (agency_id, assigned_member_id)
    references public.agency_members (agency_id, id) on delete set null (assigned_member_id)
);

create index quotes_agency_status_idx on public.quotes (agency_id, status, updated_at desc);
create index quotes_agency_deal_idx on public.quotes (agency_id, deal_id);
create index quotes_agency_customer_idx on public.quotes (agency_id, customer_id);

create table public.quote_options (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  quote_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (char_length(description) <= 2000),
  position smallint not null default 0,
  service_fee_cents bigint not null default 0 check (service_fee_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  -- Computed by private.quote_options_compute(); never trusted from the client.
  subtotal_cents bigint not null default 0,
  total_cents bigint not null default 0 check (total_cents >= 0),
  cost_total_cents bigint not null default 0,
  margin_cents bigint not null default 0,
  commission_total_cents bigint not null default 0,
  items_count smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, id),
  constraint quote_options_quote_fk foreign key (agency_id, quote_id) references public.quotes (agency_id, id) on delete cascade
);

create index quote_options_quote_idx on public.quote_options (quote_id, position);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  quote_option_id uuid not null,
  item_type public.quote_item_type not null,
  position smallint not null default 0,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  description text check (char_length(description) <= 2000),
  supplier_name text check (char_length(supplier_name) <= 120),
  start_date date,
  end_date date,
  quantity smallint not null default 1 check (quantity between 1 and 999),
  -- Unit values in cents; the line is multiplied by quantity.
  cost_cents bigint not null default 0 check (cost_cents >= 0),
  markup_cents bigint not null default 0 check (markup_cents >= 0),
  pass_through_fees_cents bigint not null default 0 check (pass_through_fees_cents >= 0),
  commission_cents bigint not null default 0 check (commission_cents >= 0),
  -- Computed: price = cost + markup + fees; total = price × quantity.
  price_cents bigint not null default 0,
  total_cents bigint not null default 0,
  show_price_to_customer boolean not null default true,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  provider_ref jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_items_option_fk foreign key (agency_id, quote_option_id)
    references public.quote_options (agency_id, id) on delete cascade,
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index quote_items_option_idx on public.quote_items (quote_option_id, position);

-- Generic triggers -------------------------------------------------------------------------------
create trigger quotes_set_updated_at before update on public.quotes
  for each row execute function private.set_updated_at();
create trigger quotes_prevent_agency_change before update on public.quotes
  for each row execute function private.prevent_agency_change();
create trigger quote_options_set_updated_at before update on public.quote_options
  for each row execute function private.set_updated_at();
create trigger quote_options_prevent_agency_change before update on public.quote_options
  for each row execute function private.prevent_agency_change();
create trigger quote_items_set_updated_at before update on public.quote_items
  for each row execute function private.set_updated_at();
create trigger quote_items_prevent_agency_change before update on public.quote_items
  for each row execute function private.prevent_agency_change();

-- Quotes: customer/request come from the deal; status transitions are validated. -----------------
create or replace function private.quotes_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ready_options integer;
begin
  if tg_op = 'INSERT' then
    select d.customer_id into new.customer_id from public.deals d where d.id = new.deal_id and d.agency_id = new.agency_id;
    select r.id into new.travel_request_id from public.travel_requests r where r.deal_id = new.deal_id;
    new.status := 'draft';
    new.ready_at := null;
    new.archived_at := null;
    return new;
  end if;

  if new.deal_id is distinct from old.deal_id or new.customer_id is distinct from old.customer_id then
    raise exception 'a quote cannot move to another deal' using errcode = '23514';
  end if;
  if new.currency is distinct from old.currency
     and exists (select 1 from public.quote_items i join public.quote_options o on o.id = i.quote_option_id where o.quote_id = new.id) then
    raise exception 'currency cannot change once the quote has items' using errcode = '23514';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'ready' then
      select count(*) into v_ready_options from public.quote_options where quote_id = new.id and items_count > 0;
      if v_ready_options = 0 then
        raise exception 'a quote needs at least one option with items to be ready' using errcode = '23514';
      end if;
      new.ready_at := now();
      new.archived_at := null;
    elsif new.status = 'archived' then
      new.archived_at := now();
    else
      new.ready_at := null;
      new.archived_at := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.quotes_before_write() from public, anon, authenticated;

create trigger quotes_before_write before insert or update on public.quotes
  for each row execute function private.quotes_before_write();

-- Moves the deal forward (never backwards) and emits domain events. Deterministic, not AI. --------
create or replace function private.quotes_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal public.deals%rowtype;
  v_current text;
  v_target text;
  v_stage uuid;
begin
  if tg_op = 'INSERT' then
    perform private.emit_event(new.agency_id, 'quote.created', 'quote', new.id, jsonb_build_object('deal_id', new.deal_id));
    v_target := 'quoting';
  elsif new.status = 'ready' and old.status is distinct from 'ready' then
    perform private.emit_event(new.agency_id, 'quote.ready', 'quote', new.id, jsonb_build_object('deal_id', new.deal_id));
    v_target := 'quote_ready';
    -- The "prepare quote" task is done once a quote is ready.
    update public.tasks set status = 'done'
    where deal_id = new.deal_id and task_type = 'prepare_quote' and status = 'open';
  else
    return null;
  end if;

  select * into v_deal from public.deals where id = new.deal_id;
  select system_key into v_current from public.pipeline_stages where id = v_deal.stage_id;
  if v_current in ('new_contact', 'qualifying', 'request_complete')
     or (v_target = 'quote_ready' and v_current = 'quoting') then
    select id into v_stage from public.pipeline_stages
    where pipeline_id = v_deal.pipeline_id and system_key = v_target and archived_at is null;
    if v_stage is not null then
      update public.deals set stage_id = v_stage where id = v_deal.id;
    end if;
  end if;
  return null;
end;
$$;

revoke all on function private.quotes_after_write() from public, anon, authenticated;

create trigger quotes_after_write after insert or update of status on public.quotes
  for each row execute function private.quotes_after_write();

-- Options and items can only change while the quote is a draft. -----------------------------------
create or replace function private.assert_quote_editable(p_quote uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.quotes where id = p_quote and status <> 'draft') then
    raise exception 'quote is not a draft; reopen it to edit' using errcode = '55000';
  end if;
end;
$$;

revoke all on function private.assert_quote_editable(uuid) from public, anon, authenticated;

/** Option totals, recomputed from its items on every write. */
create or replace function private.quote_options_compute()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subtotal bigint;
  v_cost bigint;
  v_markup bigint;
  v_commission bigint;
  v_count integer;
begin
  if pg_trigger_depth() = 1 then
    perform private.assert_quote_editable(new.quote_id);
    if tg_op = 'UPDATE' and new.quote_id is distinct from old.quote_id then
      raise exception 'an option cannot move to another quote' using errcode = '23514';
    end if;
  end if;

  select coalesce(sum(total_cents), 0), coalesce(sum(cost_cents * quantity), 0), coalesce(sum(markup_cents * quantity), 0),
         coalesce(sum(commission_cents * quantity), 0), count(*)
  into v_subtotal, v_cost, v_markup, v_commission, v_count
  from public.quote_items where quote_option_id = new.id;

  if new.discount_cents > v_subtotal + new.service_fee_cents then
    raise exception 'discount cannot exceed the option value' using errcode = '23514';
  end if;

  new.subtotal_cents := v_subtotal;
  new.total_cents := v_subtotal + new.service_fee_cents - new.discount_cents;
  new.cost_total_cents := v_cost;
  new.margin_cents := v_markup + new.service_fee_cents - new.discount_cents;
  new.commission_total_cents := v_commission;
  new.items_count := v_count;
  return new;
end;
$$;

revoke all on function private.quote_options_compute() from public, anon, authenticated;

create trigger quote_options_compute before insert or update on public.quote_options
  for each row execute function private.quote_options_compute();

create or replace function private.quote_options_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Cascades from a quote deletion (depth > 1) are fine; direct deletes need a draft.
  if pg_trigger_depth() = 1 then
    perform private.assert_quote_editable(old.quote_id);
  end if;
  return old;
end;
$$;

revoke all on function private.quote_options_before_delete() from public, anon, authenticated;

create trigger quote_options_before_delete before delete on public.quote_options
  for each row execute function private.quote_options_before_delete();

create or replace function private.quote_items_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote uuid;
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() = 1 then
      select quote_id into v_quote from public.quote_options where id = old.quote_option_id;
      perform private.assert_quote_editable(v_quote);
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and new.quote_option_id is distinct from old.quote_option_id then
    raise exception 'an item cannot move to another option' using errcode = '23514';
  end if;
  select quote_id into v_quote from public.quote_options where id = new.quote_option_id;
  perform private.assert_quote_editable(v_quote);

  new.price_cents := new.cost_cents + new.markup_cents + new.pass_through_fees_cents;
  new.total_cents := new.price_cents * new.quantity;
  return new;
end;
$$;

revoke all on function private.quote_items_before_write() from public, anon, authenticated;

create trigger quote_items_before_write before insert or update or delete on public.quote_items
  for each row execute function private.quote_items_before_write();

/** Touching the option makes quote_options_compute() refresh its totals. */
create or replace function private.quote_items_refresh_option()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.quote_options set updated_at = now() where id = old.quote_option_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.quote_option_id is distinct from old.quote_option_id) then
    update public.quote_options set updated_at = now() where id = new.quote_option_id;
  end if;
  return null;
end;
$$;

revoke all on function private.quote_items_refresh_option() from public, anon, authenticated;

create trigger quote_items_refresh_option after insert or update or delete on public.quote_items
  for each row execute function private.quote_items_refresh_option();

-- RLS ------------------------------------------------------------------------------------------
-- Readers: owner, manager, consultant and financial. Attendants never see quotes (nor margins).
alter table public.quotes enable row level security;
alter table public.quotes force row level security;
alter table public.quote_options enable row level security;
alter table public.quote_options force row level security;
alter table public.quote_items enable row level security;
alter table public.quote_items force row level security;

create policy quotes_select on public.quotes for select to authenticated
  using ((select private.has_role(agency_id, '{owner,manager,consultant,financial}')));
create policy quotes_insert on public.quotes for insert to authenticated
  with check ((select private.has_role(agency_id, '{owner,manager,consultant}')) and created_by = (select auth.uid()));
create policy quotes_update on public.quotes for update to authenticated
  using ((select private.has_role(agency_id, '{owner,manager,consultant}')))
  with check ((select private.has_role(agency_id, '{owner,manager,consultant}')));
create policy quotes_delete on public.quotes for delete to authenticated
  using ((select private.has_role(agency_id, '{owner,manager}')));

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
