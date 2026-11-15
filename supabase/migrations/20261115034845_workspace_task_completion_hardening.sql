-- Keep the exposed RPC as SECURITY INVOKER; isolate the narrowly scoped privileged update.
create or replace function private.complete_ghoustory_workspace_task(p_task_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated boolean := false;
begin
  if (select auth.uid()) is null
     or not (private.is_ghoustory_workspace_member() or private.is_ghoustory_app_admin()) then
    return false;
  end if;

  update public.ghoustory_workspace_tasks
     set status = 'done'
   where id = p_task_id
     and status not in ('done','cancelled')
     and (
       created_by = (select auth.uid())
       or assigned_to = (select auth.uid())
       or private.is_ghoustory_app_admin()
     )
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;

revoke all on function private.complete_ghoustory_workspace_task(uuid) from public, anon;
grant execute on function private.complete_ghoustory_workspace_task(uuid) to authenticated;

create or replace function public.ghoustory_workspace_complete_task(p_task_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.complete_ghoustory_workspace_task(p_task_id);
$$;

revoke all on function public.ghoustory_workspace_complete_task(uuid) from public, anon;
grant execute on function public.ghoustory_workspace_complete_task(uuid) to authenticated;
