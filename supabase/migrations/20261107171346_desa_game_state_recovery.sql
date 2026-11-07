-- Persist clue and mission progress so room members can recover after reconnecting.
create or replace function private.desa_save_game_state(
  p_room uuid,
  p_clues boolean[],
  p_mission_completed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_state jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Silakan login terlebih dahulu.';
  end if;
  if not private.desa_is_member(p_room) then
    raise exception 'Kamu bukan anggota ruang ini.';
  end if;
  if p_clues is null
     or cardinality(p_clues) <> 3
     or p_clues[1] is null
     or p_clues[2] is null
     or p_clues[3] is null then
    raise exception 'Data bukti tidak valid.';
  end if;

  update public.desa_rooms
  set game_state = jsonb_build_object(
    'clues', jsonb_build_array(
      coalesce((game_state->'clues'->>0)::boolean,false) or p_clues[1],
      coalesce((game_state->'clues'->>1)::boolean,false) or p_clues[2],
      coalesce((game_state->'clues'->>2)::boolean,false) or p_clues[3]
    ),
    'mission_completed',
      coalesce((game_state->>'mission_completed')::boolean,false)
      or coalesce(p_mission_completed,false)
  ),
  updated_at = now()
  where id = p_room
  returning game_state into v_state;

  if not found then
    raise exception 'Room tidak ditemukan.';
  end if;
  return v_state;
end
$function$;

create or replace function public.desa_save_game_state(
  p_room uuid,
  p_clues boolean[],
  p_mission_completed boolean default false
)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select private.desa_save_game_state(p_room,p_clues,p_mission_completed);
$function$;
