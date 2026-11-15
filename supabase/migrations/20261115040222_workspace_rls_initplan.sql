-- Cache stable membership/admin checks once per statement in Workspace RLS policies.
alter policy "Workspace members read ideas"
  on public.ghoustory_workspace_ideas
  using (
    (select private.is_ghoustory_workspace_member())
    or (select private.is_ghoustory_app_admin())
  );

alter policy "Members submit own ideas"
  on public.ghoustory_workspace_ideas
  with check (
    ((select private.is_ghoustory_workspace_member()) or (select private.is_ghoustory_app_admin()))
    and created_by = (select auth.uid())
    and status = 'new'
  );

alter policy "Admins moderate ideas"
  on public.ghoustory_workspace_ideas
  using ((select private.is_ghoustory_app_admin()))
  with check ((select private.is_ghoustory_app_admin()));

alter policy "Admins delete ideas"
  on public.ghoustory_workspace_ideas
  using ((select private.is_ghoustory_app_admin()));

alter policy "Workspace members read tasks"
  on public.ghoustory_workspace_tasks
  using (
    (select private.is_ghoustory_workspace_member())
    or (select private.is_ghoustory_app_admin())
  );

alter policy "Members create tasks"
  on public.ghoustory_workspace_tasks
  with check (
    ((select private.is_ghoustory_workspace_member()) or (select private.is_ghoustory_app_admin()))
    and created_by = (select auth.uid())
    and (assigned_to is null or exists (
      select 1 from public.ghoustory_profiles p where p.user_id = assigned_to
    ))
  );

alter policy "Task owners update tasks"
  on public.ghoustory_workspace_tasks
  using (
    ((select private.is_ghoustory_workspace_member()) or (select private.is_ghoustory_app_admin()))
    and (created_by = (select auth.uid()) or (select private.is_ghoustory_app_admin()))
  )
  with check (
    ((select private.is_ghoustory_workspace_member()) or (select private.is_ghoustory_app_admin()))
    and (created_by = (select auth.uid()) or (select private.is_ghoustory_app_admin()))
    and (assigned_to is null or exists (
      select 1 from public.ghoustory_profiles p where p.user_id = assigned_to
    ))
  );

alter policy "Admins delete tasks"
  on public.ghoustory_workspace_tasks
  using ((select private.is_ghoustory_app_admin()));

alter policy "Workspace members read activity"
  on public.ghoustory_workspace_activity
  using (
    (select private.is_ghoustory_workspace_member())
    or (select private.is_ghoustory_app_admin())
  );

alter policy "Admins read AI usage"
  on public.ghoustory_ai_usage
  using ((select private.is_ghoustory_app_admin()));
