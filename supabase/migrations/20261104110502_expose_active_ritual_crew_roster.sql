grant select on table private.ghoustory_ritual_crew_memberships to authenticated;
drop policy if exists "Workspace members can view ritual memberships" on private.ghoustory_ritual_crew_memberships;
create policy "Workspace members can view ritual memberships"
on private.ghoustory_ritual_crew_memberships
for select to authenticated
using (private.is_ghoustory_workspace_member());

create or replace view public.ghoustory_ritual_crew_profiles
with (security_invoker = true)
as
select p.user_id,p.nickname,p.role,p.avatar_url,p.last_seen_at
from public.ghoustory_profiles p
join private.ghoustory_ritual_crew_memberships m on m.user_id=p.user_id;

grant select on public.ghoustory_ritual_crew_profiles to authenticated;
