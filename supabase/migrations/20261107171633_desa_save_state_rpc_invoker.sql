-- Keep the exposed API wrapper SECURITY INVOKER; authorization is enforced
-- by the private implementation and its authenticated membership checks.
create or replace function public.desa_save_game_state(
  p_room uuid,
  p_clues boolean[],
  p_mission_completed boolean default false
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.desa_save_game_state(p_room,p_clues,p_mission_completed);
$function$;

revoke all on function public.desa_save_game_state(uuid,boolean[],boolean) from public, anon;
grant execute on function public.desa_save_game_state(uuid,boolean[],boolean) to authenticated;
