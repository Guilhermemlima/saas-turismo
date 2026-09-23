-- 0010 public bucket for agency logos (they appear on public proposals). Writes are restricted
-- to owners/managers of the agency whose id is the first folder of the object path.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agency-logos', 'agency-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_manage_agency_folder(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_folder text := (storage.foldername(p_name))[1];
begin
  if v_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.has_role(v_folder::uuid, '{owner,manager}');
end;
$$;

revoke all on function private.can_manage_agency_folder(text) from public, anon;
grant execute on function private.can_manage_agency_folder(text) to authenticated;

-- Reads go through the public URL; this policy only lets managers list/replace their own files.
create policy agency_logos_select on storage.objects for select to authenticated
  using (bucket_id = 'agency-logos' and private.can_manage_agency_folder(name));

create policy agency_logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'agency-logos' and private.can_manage_agency_folder(name));

create policy agency_logos_update on storage.objects for update to authenticated
  using (bucket_id = 'agency-logos' and private.can_manage_agency_folder(name))
  with check (bucket_id = 'agency-logos' and private.can_manage_agency_folder(name));

create policy agency_logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'agency-logos' and private.can_manage_agency_folder(name));
