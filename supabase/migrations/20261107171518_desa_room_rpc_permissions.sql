-- Restrict Desa multiplayer RPC access to authenticated room members.
grant usage on schema private to authenticated;

revoke all on function private.desa_is_member(uuid) from public, anon;
revoke all on function private.desa_create_room(text) from public, anon;
revoke all on function private.desa_join_room(text,text) from public, anon;
revoke all on function private.desa_get_room(uuid) from public, anon;
revoke all on function private.desa_set_ready(uuid,boolean) from public, anon;
revoke all on function private.desa_start_room(uuid) from public, anon;
revoke all on function private.desa_leave_room(uuid) from public, anon;
revoke all on function private.desa_save_game_state(uuid,boolean[],boolean) from public, anon;

grant execute on function private.desa_is_member(uuid) to authenticated;
grant execute on function private.desa_create_room(text) to authenticated;
grant execute on function private.desa_join_room(text,text) to authenticated;
grant execute on function private.desa_get_room(uuid) to authenticated;
grant execute on function private.desa_set_ready(uuid,boolean) to authenticated;
grant execute on function private.desa_start_room(uuid) to authenticated;
grant execute on function private.desa_leave_room(uuid) to authenticated;
grant execute on function private.desa_save_game_state(uuid,boolean[],boolean) to authenticated;

revoke all on function public.desa_create_room(text) from public, anon;
revoke all on function public.desa_join_room(text,text) from public, anon;
revoke all on function public.desa_get_room(uuid) from public, anon;
revoke all on function public.desa_set_ready(uuid,boolean) from public, anon;
revoke all on function public.desa_start_room(uuid) from public, anon;
revoke all on function public.desa_leave_room(uuid) from public, anon;
revoke all on function public.desa_save_game_state(uuid,boolean[],boolean) from public, anon;

grant execute on function public.desa_create_room(text) to authenticated;
grant execute on function public.desa_join_room(text,text) to authenticated;
grant execute on function public.desa_get_room(uuid) to authenticated;
grant execute on function public.desa_set_ready(uuid,boolean) to authenticated;
grant execute on function public.desa_start_room(uuid) to authenticated;
grant execute on function public.desa_leave_room(uuid) to authenticated;
grant execute on function public.desa_save_game_state(uuid,boolean[],boolean) to authenticated;
