drop policy if exists desa_players_member_read on public.desa_players;
create policy desa_players_self_read
on public.desa_players
for select
to authenticated
using (user_id = (select auth.uid()));
