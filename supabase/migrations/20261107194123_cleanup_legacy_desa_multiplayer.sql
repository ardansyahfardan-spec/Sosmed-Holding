-- Retire the previous Desa Terlarang multiplayer backend before rebuilding it.
-- The realtime.messages policies reference private.desa_is_member(); keep a safe
-- invoker-only stub returning false because the realtime schema is platform-managed.
begin;
set local lock_timeout = '5s';

create or replace function private.desa_is_member(p_room uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$ select false; $function$;

drop function if exists public.desa_create_room(text);
drop function if exists public.desa_get_room(uuid);
drop function if exists public.desa_join_room(text,text);
drop function if exists public.desa_leave_room(uuid);
drop function if exists public.desa_save_game_state(uuid,boolean[],boolean);
drop function if exists public.desa_set_ready(uuid,boolean);
drop function if exists public.desa_start_room(uuid);

drop function if exists private.desa_create_room(text);
drop function if exists private.desa_get_room(uuid);
drop function if exists private.desa_join_room(text,text);
drop function if exists private.desa_leave_room(uuid);
drop function if exists private.desa_save_game_state(uuid,boolean[],boolean);
drop function if exists private.desa_set_ready(uuid,boolean);
drop function if exists private.desa_start_room(uuid);

drop table if exists public.desa_players;
drop table if exists public.desa_rooms;
commit;
