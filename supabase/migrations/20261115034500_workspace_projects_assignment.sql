-- Add lightweight project grouping and Crew assignment to Workspace tasks.
alter table public.ghoustory_workspace_tasks
  add column if not exists project_name text not null default 'Umum'
  check (char_length(project_name) between 1 and 100);

create index if not exists ghoustory_workspace_tasks_project_idx
  on public.ghoustory_workspace_tasks (project_name, status, due_at);

drop policy if exists "Members create tasks" on public.ghoustory_workspace_tasks;
create policy "Members create tasks"
  on public.ghoustory_workspace_tasks for insert to authenticated
  with check (
    (private.is_ghoustory_workspace_member() or private.is_ghoustory_app_admin())
    and created_by = (select auth.uid())
    and (assigned_to is null or exists (
      select 1 from public.ghoustory_profiles p where p.user_id = assigned_to
    ))
  );

drop policy if exists "Task owners update tasks" on public.ghoustory_workspace_tasks;
create policy "Task owners update tasks"
  on public.ghoustory_workspace_tasks for update to authenticated
  using (
    (private.is_ghoustory_workspace_member() or private.is_ghoustory_app_admin())
    and (created_by = (select auth.uid()) or private.is_ghoustory_app_admin())
  )
  with check (
    (private.is_ghoustory_workspace_member() or private.is_ghoustory_app_admin())
    and (created_by = (select auth.uid()) or private.is_ghoustory_app_admin())
    and (assigned_to is null or exists (
      select 1 from public.ghoustory_profiles p where p.user_id = assigned_to
    ))
  );

create or replace function public.ghoustory_workspace_complete_task(p_task_id uuid)
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

revoke all on function public.ghoustory_workspace_complete_task(uuid) from public, anon;
grant execute on function public.ghoustory_workspace_complete_task(uuid) to authenticated;
