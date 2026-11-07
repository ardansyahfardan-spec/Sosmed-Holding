create or replace function private.malam_submit_action(p_room uuid, p_target uuid, p_action text)
returns void
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  r public.malam_rooms%rowtype;
  role_name text;
  target_role text;
begin
  select * into r from public.malam_rooms where id=p_room for update;
  if not found then raise exception 'Ruang tidak ditemukan.'; end if;
  if not exists(select 1 from public.malam_players where room_id=p_room and user_id=auth.uid() and is_alive) then
    raise exception 'Kamu sudah tereliminasi atau bukan anggota.';
  end if;
  if not exists(select 1 from public.malam_players where room_id=p_room and user_id=p_target and is_alive) then
    raise exception 'Target tidak tersedia.';
  end if;
  select role into role_name from private.malam_roles where room_id=p_room and user_id=auth.uid();
  if r.phase='night' then
    if (p_action='attack' and role_name<>'siluman') or (p_action='investigate' and role_name<>'paranormal') or (p_action='protect' and role_name<>'penjaga') then
      raise exception 'Peranmu tidak dapat melakukan aksi ini.';
    end if;
    if p_action not in ('attack','investigate','protect') then raise exception 'Aksi malam tidak valid.'; end if;
    if p_action='attack' then
      select role into target_role from private.malam_roles where room_id=p_room and user_id=p_target;
      if target_role='siluman' then raise exception 'Siluman tidak dapat menyerang rekan satu kubunya.'; end if;
    end if;
    if p_action='investigate' and p_target=auth.uid() then raise exception 'Pilih pemain lain untuk diperiksa.'; end if;
    if p_action='investigate' and exists(
      select 1 from private.malam_actions where room_id=p_room and round_no=r.round_no and phase='night'
      and actor_id=auth.uid() and action_type='investigate'
    ) then raise exception 'Kamu sudah memeriksa satu pemain malam ini. Tunggu malam berikutnya.'; end if;
  elsif r.phase='voting' and p_action='vote' then
    if p_target=auth.uid() then raise exception 'Kamu tidak dapat memilih diri sendiri.'; end if;
  else raise exception 'Aksi tidak sesuai fase permainan.';
  end if;
  insert into private.malam_actions(room_id,round_no,phase,actor_id,target_id,action_type)
  values(p_room,r.round_no,r.phase,auth.uid(),p_target,p_action)
  on conflict(room_id,round_no,phase,actor_id)
  do update set target_id=excluded.target_id,action_type=excluded.action_type,created_at=now();
end
$function$;
