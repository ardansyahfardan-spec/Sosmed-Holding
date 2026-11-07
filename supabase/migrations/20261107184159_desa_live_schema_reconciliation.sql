-- Reconcile the live Desa Terlarang multiplayer RPC contract with source control.
-- Idempotent: does not delete or reset rooms, players, or saved game_state.
create or replace function private.desa_join_room(p_code text, p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  r public.desa_rooms%rowtype;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Silakan login terlebih dahulu.';
  end if;
  if char_length(trim(coalesce(p_nickname,''))) not between 2 and 24 then
    raise exception 'Nama pemain harus 2–24 karakter.';
  end if;

  select * into r
  from public.desa_rooms
  where code = upper(trim(coalesce(p_code,'')))
  for update;

  if not found then
    raise exception 'Kode ruang tidak ditemukan atau permainan sudah dimulai.';
  end if;

  -- Existing members may reconnect after the host starts the game.
  if exists (
    select 1 from public.desa_players p
    where p.room_id = r.id and p.user_id = v_uid
  ) then
    update public.desa_players
    set nickname = trim(p_nickname)
    where room_id = r.id and user_id = v_uid;
    return jsonb_build_object('room_id',r.id,'code',r.code);
  end if;

  if r.status <> 'lobby' then
    raise exception 'Permainan sudah dimulai. Hanya anggota sebelumnya yang bisa masuk kembali.';
  end if;

  select count(*) into v_count
  from public.desa_players p where p.room_id = r.id;

  if v_count >= r.max_players then
    raise exception 'Ruang sudah penuh (maksimal 5 pemain).';
  end if;

  insert into public.desa_players(room_id,user_id,nickname)
  values(r.id,v_uid,trim(p_nickname));

  return jsonb_build_object('room_id',r.id,'code',r.code);
end
$function$;

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

  -- Merge monotonically: a stale client cannot erase clues already found.
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

-- Public API wrappers must remain SECURITY INVOKER.
create or replace function public.desa_join_room(p_code text, p_nickname text)
returns jsonb language sql security invoker set search_path = ''
as $function$ select private.desa_join_room(p_code,p_nickname); $function$;

create or replace function public.desa_save_game_state(
  p_room uuid,
  p_clues boolean[],
  p_mission_completed boolean default false
)
returns jsonb language sql security invoker set search_path = ''
as $function$ select private.desa_save_game_state(p_room,p_clues,p_mission_completed); $function$;

grant usage on schema private to authenticated;
revoke all on function private.desa_join_room(text,text) from public, anon;
revoke all on function private.desa_save_game_state(uuid,boolean[],boolean) from public, anon;
grant execute on function private.desa_join_room(text,text) to authenticated;
grant execute on function private.desa_save_game_state(uuid,boolean[],boolean) to authenticated;

revoke all on function public.desa_join_room(text,text) from public, anon;
revoke all on function public.desa_save_game_state(uuid,boolean[],boolean) from public, anon;
grant execute on function public.desa_join_room(text,text) to authenticated;
grant execute on function public.desa_save_game_state(uuid,boolean[],boolean) to authenticated;
