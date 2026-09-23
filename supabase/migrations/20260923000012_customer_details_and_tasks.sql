-- 0012 customer tags, notes, structured preferences and tasks.

-- Tags -------------------------------------------------------------------------------------------
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null default 'slate' check (color ~ '^[a-z]{3,12}$'),
  created_at timestamptz not null default now(),
  unique (agency_id, id)
);

create unique index tags_agency_name_uidx on public.tags (agency_id, lower(name));

create table public.customer_tags (
  agency_id uuid not null,
  customer_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (customer_id, tag_id),
  constraint customer_tags_customer_fk foreign key (agency_id, customer_id) references public.customers (agency_id, id) on delete cascade,
  constraint customer_tags_tag_fk foreign key (agency_id, tag_id) references public.tags (agency_id, id) on delete cascade
);

create index customer_tags_tag_idx on public.customer_tags (tag_id);

-- Notes ------------------------------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  customer_id uuid not null,
  deal_id uuid,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  author_actor public.actor_type not null default 'user',
  author_user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint notes_customer_fk foreign key (agency_id, customer_id) references public.customers (agency_id, id) on delete cascade,
  constraint notes_deal_fk foreign key (agency_id, deal_id) references public.deals (agency_id, id) on delete cascade
);

create index notes_customer_idx on public.notes (agency_id, customer_id, created_at desc);

-- Structured memory about the traveler (used later by the AI agent instead of old chat logs). -----
create table public.customer_preferences (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  customer_id uuid not null,
  category text not null check (category in ('accommodation', 'flight', 'food', 'travel_style', 'destination', 'budget', 'accessibility', 'other')),
  value text not null check (char_length(btrim(value)) between 1 and 200),
  source public.actor_type not null default 'user',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint customer_preferences_customer_fk foreign key (agency_id, customer_id) references public.customers (agency_id, id) on delete cascade
);

create unique index customer_preferences_unique_value on public.customer_preferences (customer_id, category, lower(value));

-- Tasks ------------------------------------------------------------------------------------------
create type public.task_status as enum ('open', 'done', 'cancelled');
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  description text check (char_length(description) <= 2000),
  task_type text not null default 'other' check (task_type in (
    'prepare_quote', 'research_hotel', 'send_proposal', 'call_customer', 'confirm_payment',
    'send_voucher', 'check_in', 'post_sale', 'follow_up', 'other')),
  status public.task_status not null default 'open',
  priority public.task_priority not null default 'normal',
  due_at timestamptz,
  assigned_member_id uuid,
  customer_id uuid,
  deal_id uuid,
  created_by_actor public.actor_type not null default 'user',
  created_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_assigned_member_fk foreign key (agency_id, assigned_member_id)
    references public.agency_members (agency_id, id) on delete set null (assigned_member_id),
  constraint tasks_customer_fk foreign key (agency_id, customer_id)
    references public.customers (agency_id, id) on delete cascade,
  constraint tasks_deal_fk foreign key (agency_id, deal_id)
    references public.deals (agency_id, id) on delete cascade
);

create index tasks_agency_assigned_idx on public.tasks (agency_id, assigned_member_id, status, due_at);
create index tasks_agency_customer_idx on public.tasks (agency_id, customer_id);
create index tasks_agency_deal_idx on public.tasks (agency_id, deal_id);
-- At most one open "prepare quote" task per deal (the automatic rule is idempotent).
create unique index tasks_one_open_prepare_quote_per_deal on public.tasks (deal_id)
  where task_type = 'prepare_quote' and status = 'open';

create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function private.set_updated_at();
create trigger tasks_prevent_agency_change before update on public.tasks
  for each row execute function private.prevent_agency_change();

create or replace function private.tasks_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_before_write before insert or update on public.tasks
  for each row execute function private.tasks_before_write();

-- Whoever receives a task from someone else gets notified.
create or replace function private.tasks_notify_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if new.assigned_member_id is null or new.status <> 'open' then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.assigned_member_id is not distinct from old.assigned_member_id then
    return null;
  end if;

  select user_id into v_user from public.agency_members where id = new.assigned_member_id and status = 'active';
  if v_user is not null and v_user is distinct from (select auth.uid()) then
    insert into public.notifications (agency_id, user_id, type, title, body, entity_type, entity_id)
    values (new.agency_id, v_user, (case when new.task_type = 'prepare_quote' then 'quote_needed' else 'system' end)::public.notification_type,
            '📋 Nova tarefa: ' || left(new.title, 120), new.description, 'task', new.id);
  end if;
  return null;
end;
$$;

revoke all on function private.tasks_notify_assignee() from public, anon, authenticated;

create trigger tasks_notify_assignee after insert or update of assigned_member_id on public.tasks
  for each row execute function private.tasks_notify_assignee();

-- RLS ------------------------------------------------------------------------------------------
alter table public.tags enable row level security;
alter table public.tags force row level security;
alter table public.customer_tags enable row level security;
alter table public.customer_tags force row level security;
alter table public.notes enable row level security;
alter table public.notes force row level security;
alter table public.customer_preferences enable row level security;
alter table public.customer_preferences force row level security;
alter table public.tasks enable row level security;
alter table public.tasks force row level security;

-- Customer details follow the customers table rules: every member reads, service roles write.
create policy tags_select on public.tags for select to authenticated using ((select private.is_member(agency_id)));
create policy tags_insert on public.tags for insert to authenticated
  with check ((select private.has_role(agency_id, '{owner,manager,consultant,attendant}')));
create policy tags_update on public.tags for update to authenticated
  using ((select private.has_role(agency_id, '{owner,manager}'))) with check ((select private.has_role(agency_id, '{owner,manager}')));
create policy tags_delete on public.tags for delete to authenticated using ((select private.has_role(agency_id, '{owner,manager}')));

create policy customer_tags_select on public.customer_tags for select to authenticated using ((select private.is_member(agency_id)));
create policy customer_tags_insert on public.customer_tags for insert to authenticated
  with check ((select private.has_role(agency_id, '{owner,manager,consultant,attendant}')));
create policy customer_tags_delete on public.customer_tags for delete to authenticated
  using ((select private.has_role(agency_id, '{owner,manager,consultant,attendant}')));

create policy notes_select on public.notes for select to authenticated using ((select private.is_member(agency_id)));
create policy notes_insert on public.notes for insert to authenticated
  with check (
    (select private.has_role(agency_id, '{owner,manager,consultant,attendant}'))
    and author_user_id = (select auth.uid()) and author_actor = 'user'
  );
-- Authors delete their own notes; owners/managers can delete any.
create policy notes_delete on public.notes for delete to authenticated
  using (
    (select private.is_member(agency_id))
    and (author_user_id = (select auth.uid()) or (select private.has_role(agency_id, '{owner,manager}')))
  );

create policy customer_preferences_select on public.customer_preferences for select to authenticated using ((select private.is_member(agency_id)));
create policy customer_preferences_insert on public.customer_preferences for insert to authenticated
  with check ((select private.has_role(agency_id, '{owner,manager,consultant,attendant}')) and source = 'user');
create policy customer_preferences_delete on public.customer_preferences for delete to authenticated
  using ((select private.has_role(agency_id, '{owner,manager,consultant,attendant}')));

-- Tasks are for everyone in the agency (the financial team confirms payments, sends vouchers…).
create policy tasks_select on public.tasks for select to authenticated using ((select private.is_member(agency_id)));
create policy tasks_insert on public.tasks for insert to authenticated
  with check ((select private.is_member(agency_id)) and created_by = (select auth.uid()) and created_by_actor = 'user');
create policy tasks_update on public.tasks for update to authenticated
  using ((select private.is_member(agency_id))) with check ((select private.is_member(agency_id)));
create policy tasks_delete on public.tasks for delete to authenticated
  using ((select private.has_role(agency_id, '{owner,manager}')) or created_by = (select auth.uid()));

revoke all on table public.tags, public.customer_tags, public.notes, public.customer_preferences, public.tasks from anon;
revoke update on table public.notes, public.customer_preferences, public.customer_tags from authenticated;
