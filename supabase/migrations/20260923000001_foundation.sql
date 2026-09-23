-- 0001 foundation: extensions, private schema, shared helpers and base enums.

create extension if not exists pgcrypto with schema extensions;

-- Functions used by RLS policies live here; this schema is NOT exposed by the Data API.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- updated_at maintenance --------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Tenant column is immutable once a row exists -----------------------------------
create or replace function private.prevent_agency_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.agency_id is distinct from old.agency_id then
    raise exception 'agency_id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Enums ------------------------------------------------------------------------------
create type public.agency_role as enum ('owner', 'manager', 'consultant', 'attendant', 'financial');
create type public.agency_status as enum ('trial', 'active', 'suspended', 'cancelled');
create type public.member_status as enum ('invited', 'active', 'disabled');
create type public.actor_type as enum ('user', 'ai', 'system', 'webhook', 'platform_admin');
create type public.customer_source as enum ('whatsapp', 'manual', 'import', 'referral', 'instagram', 'website', 'other');
