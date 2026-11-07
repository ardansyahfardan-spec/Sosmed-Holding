create or replace function private.desa_create_room(p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_room uuid;
  v_code text;
begin
  if v_uid is null then
    raise exception 'Silakan login terlebih dahulu.';
  end if;
  if char_length(trim(coalesce(p_nickname,''))) not between 2 and 24 then
    raise exception 'Nama pemain harus 2–24 karakter.';
  end if;
  loop
    v_code := upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,6));
    exit when not exists(select 1 from public.desa_rooms r where r.code=v_code);
  end loop;
  insert into public.desa_rooms(code,host_id)
  values(v_code,v_uid)
  returning id into v_room;
  -- Host langsung siap dalam transaksi yang sama dengan pembuatan room.
  insert into public.desa_players(room_id,user_id,nickname,is_ready)
  values(v_room,v_uid,trim(p_nickname),true);
  return jsonb_build_object('room_id',v_room,'code',v_code);
end
$function$;

create index if not exists desa_rooms_host_id_idx
on public.desa_rooms(host_id);
