
create or replace function public.ghoustory_workspace_ai_usage_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.is_ghoustory_app_admin()
      then (select count(*) from public.ghoustory_ai_usage where created_at >= now() - interval '30 days')
    else null
  end;
$$;

revoke all on function public.ghoustory_workspace_ai_usage_count() from public, anon;
grant execute on function public.ghoustory_workspace_ai_usage_count() to authenticated;
