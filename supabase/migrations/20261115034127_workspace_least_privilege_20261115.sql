-- Tighten direct table grants: RLS is not a substitute for least-privilege SQL grants.
revoke all on table public.ghoustory_workspace_activity from public, anon, authenticated, service_role;
grant select on table public.ghoustory_workspace_activity to authenticated;

revoke all on table public.ghoustory_ai_usage from public, anon, authenticated, service_role;
grant select on table public.ghoustory_ai_usage to authenticated;
grant insert on table public.ghoustory_ai_usage to service_role;
