-- 0011 inbox: channels, conversations, messages and in-app notifications.

create type public.channel_type as enum ('whatsapp', 'simulator');
create type public.channel_status as enum ('pending', 'connected', 'disconnected', 'error');
create type public.conversation_mode as enum ('ai', 'human');
create type public.conversation_status as enum ('open', 'pending', 'closed');
create type public.message_direction as enum ('inbound', 'outbound');
create type public.message_sender as enum ('customer', 'ai', 'human', 'system');
create type public.message_status as enum ('received', 'queued', 'sending', 'sent', 'delivered', 'read', 'failed');
create type public.message_kind as enum (
  'text', 'image', 'audio', 'video', 'document', 'location', 'interactive', 'template', 'reaction', 'unsupported');
create type public.notification_type as enum (
  'hot_lead', 'new_request', 'quote_needed', 'proposal_viewed', 'customer_replied', 'proposal_accepted',
  'trip_upcoming', 'followup_overdue', 'handoff_requested', 'system');

-- Channels -------------------------------------------------------------------------------------
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  type public.channel_type not null,
  status public.channel_status not null default 'pending',
  display_name text not null check (char_length(display_name) between 2 and 80),
  phone_e164 text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  wa_phone_number_id text unique,
  wa_business_account_id text,
  -- Encrypted in the application (AES-256-GCM); never selectable by clients (column grant below).
  access_token_encrypted bytea,
  token_key_version smallint,
  connected_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, id)
);

create unique index channels_one_simulator_per_agency on public.channels (agency_id) where type = 'simulator';

create trigger channels_set_updated_at before update on public.channels
  for each row execute function private.set_updated_at();
create trigger channels_prevent_agency_change before update on public.channels
  for each row execute function private.prevent_agency_change();

-- Conversations ----------------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  channel_id uuid not null,
  customer_id uuid not null,
  status public.conversation_status not null default 'open',
  -- Human until the AI agent exists (phase 13); then new conversations start in 'ai'.
  mode public.conversation_mode not null default 'human',
  assigned_member_id uuid,
  is_simulation boolean not null default false,
  last_message_at timestamptz,
  last_message_preview text,
  last_inbound_at timestamptz,
  unread_count integer not null default 0 check (unread_count >= 0),
  summary text,
  handoff_reason text check (char_length(handoff_reason) <= 300),
  handoff_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, id),
  constraint conversations_channel_fk foreign key (agency_id, channel_id)
    references public.channels (agency_id, id) on delete cascade,
  constraint conversations_customer_fk foreign key (agency_id, customer_id)
    references public.customers (agency_id, id) on delete cascade,
  constraint conversations_assigned_member_fk foreign key (agency_id, assigned_member_id)
    references public.agency_members (agency_id, id) on delete set null (assigned_member_id)
);

create unique index conversations_one_open_per_customer_channel
  on public.conversations (channel_id, customer_id) where status <> 'closed';
create index conversations_agency_recent_idx on public.conversations (agency_id, status, last_message_at desc nulls last);
create index conversations_agency_customer_idx on public.conversations (agency_id, customer_id);

create trigger conversations_set_updated_at before update on public.conversations
  for each row execute function private.set_updated_at();
create trigger conversations_prevent_agency_change before update on public.conversations
  for each row execute function private.prevent_agency_change();

-- Messages -----------------------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  conversation_id uuid not null,
  channel_id uuid not null,
  direction public.message_direction not null,
  sender public.message_sender not null,
  sender_user_id uuid references public.profiles (id) on delete set null,
  kind public.message_kind not null default 'text',
  body text check (char_length(body) <= 4096),
  media jsonb,
  external_message_id text,
  status public.message_status not null,
  error_code text,
  error_detail text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  -- Webhook idempotency: the same provider message is stored once per channel.
  unique (channel_id, external_message_id),
  constraint messages_conversation_fk foreign key (agency_id, conversation_id)
    references public.conversations (agency_id, id) on delete cascade,
  constraint messages_channel_fk foreign key (agency_id, channel_id)
    references public.channels (agency_id, id) on delete cascade,
  check (
    (direction = 'inbound' and sender = 'customer') or
    (direction = 'outbound' and sender in ('ai', 'human', 'system'))
  )
);

create index messages_conversation_created_idx on public.messages (conversation_id, created_at);
create index messages_agency_created_idx on public.messages (agency_id, created_at desc);

-- Notifications ------------------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  title text not null check (char_length(title) <= 160),
  body text check (char_length(body) <= 300),
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx on public.notifications (user_id, read_at, created_at desc);

-- After each message: conversation summary fields, customer last contact and notifications. -------
create or replace function private.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversations%rowtype;
  v_notify uuid;
  v_customer text;
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_message_preview = left(coalesce(new.body, '[' || new.kind::text || ']'), 140),
      last_inbound_at = case when new.direction = 'inbound' then new.created_at else last_inbound_at end,
      unread_count = case when new.direction = 'inbound' then unread_count + 1 else 0 end,
      status = case when status = 'closed' then 'open' else status end
  where id = new.conversation_id
  returning * into v_conv;

  update public.customers set last_contact_at = new.created_at where id = v_conv.customer_id;

  if new.direction = 'inbound' then
    -- The assigned consultant, else the customer's owner, gets the "customer replied" alert.
    select m.user_id into v_notify
    from public.agency_members m
    where m.id = coalesce(v_conv.assigned_member_id, (select c.owner_member_id from public.customers c where c.id = v_conv.customer_id))
      and m.status = 'active';

    if v_notify is not null then
      select full_name into v_customer from public.customers where id = v_conv.customer_id;
      insert into public.notifications (agency_id, user_id, type, title, body, entity_type, entity_id)
      values (new.agency_id, v_notify, 'customer_replied', '💬 ' || coalesce(v_customer, 'Cliente') || ' respondeu',
              left(new.body, 140), 'conversation', v_conv.id);
    end if;
  end if;
  return null;
end;
$$;

revoke all on function private.messages_after_insert() from public, anon, authenticated;

create trigger messages_after_insert after insert on public.messages
  for each row execute function private.messages_after_insert();

-- Mode changes (take over / hand back) are audited.
create or replace function private.audit_conversation_mode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.mode is distinct from old.mode then
    insert into public.audit_logs (agency_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
    values (new.agency_id, 'user', (select auth.uid()),
            case when new.mode = 'human' then 'conversation.taken_over' else 'conversation.returned_to_ai' end,
            'conversation', new.id, jsonb_build_object('from', old.mode, 'to', new.mode));
  end if;
  return null;
end;
$$;

revoke all on function private.audit_conversation_mode() from public, anon, authenticated;

create trigger conversations_audit_mode after update on public.conversations
  for each row execute function private.audit_conversation_mode();

-- RLS ------------------------------------------------------------------------------------------
alter table public.channels enable row level security;
alter table public.channels force row level security;
alter table public.conversations enable row level security;
alter table public.conversations force row level security;
alter table public.messages enable row level security;
alter table public.messages force row level security;
alter table public.notifications enable row level security;
alter table public.notifications force row level security;

create policy channels_select on public.channels for select to authenticated
  using ((select private.is_member(agency_id)));
create policy channels_write on public.channels for update to authenticated
  using ((select private.has_role(agency_id, '{owner,manager}')))
  with check ((select private.has_role(agency_id, '{owner,manager}')));

-- Conversations are for the service roles; the financial profile does not read chats.
create policy conversations_select on public.conversations for select to authenticated
  using ((select private.has_role(agency_id, '{owner,manager,consultant,attendant}')));
create policy conversations_update on public.conversations for update to authenticated
  using ((select private.has_role(agency_id, '{owner,manager,consultant,attendant}')))
  with check ((select private.has_role(agency_id, '{owner,manager,consultant,attendant}')));

create policy messages_select on public.messages for select to authenticated
  using ((select private.has_role(agency_id, '{owner,manager,consultant,attendant}')));

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.channels, public.conversations, public.messages, public.notifications from anon;
-- Messages and conversations are created only through the functions below (or the service role).
revoke insert, delete on table public.conversations, public.messages from authenticated;
revoke insert, delete on table public.channels, public.notifications from authenticated;
-- Tokens never leave the database towards clients.
revoke select on table public.channels from authenticated;
grant select (id, agency_id, type, status, display_name, phone_e164, wa_phone_number_id, connected_at, last_error, created_at, updated_at)
  on public.channels to authenticated;

-- RPCs -----------------------------------------------------------------------------------------------
create or replace function private.require_service_role(p_agency uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_role(p_agency, '{owner,manager,consultant,attendant}') then
    raise exception 'insufficient role' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_service_role(uuid) from public, anon, authenticated;

/** Test conversation on the simulator channel (no external delivery). */
create or replace function public.start_simulated_conversation(p_customer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agency uuid;
  v_channel uuid;
  v_conversation uuid;
  v_member uuid;
begin
  select agency_id into v_agency from public.customers where id = p_customer_id and archived_at is null;
  if v_agency is null then
    raise exception 'customer not found' using errcode = 'P0002';
  end if;
  perform private.require_service_role(v_agency);

  insert into public.channels (agency_id, type, status, display_name, connected_at)
  values (v_agency, 'simulator', 'connected', 'Simulação', now())
  on conflict (agency_id) where type = 'simulator' do nothing;
  select id into v_channel from public.channels where agency_id = v_agency and type = 'simulator';

  select id into v_conversation from public.conversations
  where channel_id = v_channel and customer_id = p_customer_id and status <> 'closed';

  if v_conversation is null then
    select id into v_member from public.agency_members where agency_id = v_agency and user_id = (select auth.uid());
    insert into public.conversations (agency_id, channel_id, customer_id, is_simulation, assigned_member_id)
    values (v_agency, v_channel, p_customer_id, true, v_member)
    returning id into v_conversation;
  end if;
  return v_conversation;
end;
$$;

/**
 * Posts a message. Staff replies are 'human' outbound messages; `p_as_customer` is only allowed on
 * simulation conversations. A human reply on an AI conversation takes it over (mode = human).
 */
create or replace function public.post_conversation_message(p_conversation_id uuid, p_body text, p_as_customer boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversations%rowtype;
  v_channel public.channels%rowtype;
  v_id uuid;
  v_body text := btrim(p_body);
begin
  select * into v_conv from public.conversations where id = p_conversation_id;
  if v_conv.id is null then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
  perform private.require_service_role(v_conv.agency_id);

  if v_body is null or char_length(v_body) = 0 or char_length(v_body) > 4096 then
    raise exception 'message must have 1 to 4096 characters' using errcode = '22023';
  end if;
  if p_as_customer and not v_conv.is_simulation then
    raise exception 'customer messages can only be simulated on test conversations' using errcode = '42501';
  end if;

  select * into v_channel from public.channels where id = v_conv.channel_id;

  insert into public.messages (agency_id, conversation_id, channel_id, direction, sender, sender_user_id, kind, body, status, sent_at, delivered_at)
  values (
    v_conv.agency_id, v_conv.id, v_conv.channel_id,
    case when p_as_customer then 'inbound' else 'outbound' end::public.message_direction,
    case when p_as_customer then 'customer' else 'human' end::public.message_sender,
    case when p_as_customer then null else (select auth.uid()) end,
    'text', v_body,
    -- Simulator messages are "delivered" at once; real channels queue them for the sender job (phase 15).
    case when p_as_customer then 'received' when v_channel.type = 'simulator' then 'delivered' else 'queued' end::public.message_status,
    case when v_channel.type = 'simulator' and not p_as_customer then now() end,
    case when v_channel.type = 'simulator' and not p_as_customer then now() end
  )
  returning id into v_id;

  if not p_as_customer and v_conv.mode = 'ai' then
    update public.conversations set mode = 'human', handoff_reason = 'human_reply', handoff_at = now() where id = v_conv.id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.start_simulated_conversation(uuid) from public, anon;
revoke all on function public.post_conversation_message(uuid, text, boolean) from public, anon;
grant execute on function public.start_simulated_conversation(uuid) to authenticated;
grant execute on function public.post_conversation_message(uuid, text, boolean) to authenticated;

-- Realtime (Supabase only: the publication does not exist in plain Postgres test runs). -----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.conversations, public.notifications;
  end if;
end;
$$;
