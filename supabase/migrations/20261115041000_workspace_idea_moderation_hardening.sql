-- Enforce idea moderation at the database boundary, not only in the UI.
drop policy if exists "Authors and admins update ideas" on public.ghoustory_workspace_ideas;
drop policy if exists "Admins moderate ideas" on public.ghoustory_workspace_ideas;
create policy "Admins moderate ideas"
  on public.ghoustory_workspace_ideas
  for update
  to authenticated
  using (private.is_ghoustory_app_admin())
  with check (private.is_ghoustory_app_admin());

drop policy if exists "Members submit own ideas" on public.ghoustory_workspace_ideas;
create policy "Members submit own ideas"
  on public.ghoustory_workspace_ideas
  for insert
  to authenticated
  with check (
    (private.is_ghoustory_workspace_member() or private.is_ghoustory_app_admin())
    and created_by = (select auth.uid())
    and status = 'new'
  );
