-- 0006 defense in depth: the anonymous role never touches tenant tables, even with RLS.

revoke all on table
  public.profiles,
  public.agencies,
  public.agency_settings,
  public.agency_members,
  public.platform_admins,
  public.audit_logs,
  public.customers
from anon;

-- Authenticated users never write audit logs or platform admins directly.
revoke insert, update, delete on table public.audit_logs, public.platform_admins from authenticated;
