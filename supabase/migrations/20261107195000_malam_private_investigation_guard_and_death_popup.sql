-- Paranormal sees the exact inspected role privately; guard blocks attacks on protected targets;
-- publish a clear named death/save announcement when the night resolves.

create or replace function private.malam_get_state(p_room uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  uid uuid:=auth.uid();
  r public.malam_rooms%rowtype;
  my_role text;
  inv jsonb;
  players jsonb;
  revealed jsonb:='[]'::jsonb;
  my_team jsonb:='[]'::jsonb;
  action_done int:=0;
  action_total int:=0;
  my_alive boolean:=false;
begin
  if not exists(select 1 from public.malam_players where room_id=p_room and user_id=uid) then
    raise exception 'Kamu bukan anggota ruang ini.';
  end if;
  select * into r from public.malam_rooms where id=p_room;
  select role into my_role from private.malam_roles where room_id=p_room and user_id=uid;
  select is_alive into my_alive from public.malam_players where room_id=p_room and user_id=uid;
  select jsonb_agg(jsonb_build_object(
    'user_id',p.user_id,'nickname',p.nickname,'is_alive',p.is_alive,
    'is_ready',p.is_ready,'is_host',(p.user_id=r.host_id)
  ) order by p.joined_at) into players
  from public.malam_players p where p.room_id=p_room;

  if my_role='siluman' then
    select jsonb_agg(jsonb_build_object('user_id',p.user_id,'nickname',p.nickname))
    into my_team
    from private.malam_roles x
    join public.malam_players p on p.room_id=x.room_id and p.user_id=x.user_id
    where x.room_id=p_room and x.role='siluman' and p.is_alive;
  end if;

  if my_role='paranormal' then
    select jsonb_build_object('role',rr.role,'nickname',p.nickname)
    into inv
    from private.malam_roles rr
    join public.malam_players p on p.room_id=rr.room_id and p.user_id=rr.user_id
    join private.malam_actions a on a.room_id=rr.room_id and a.target_id=rr.user_id
    where a.room_id=p_room and a.actor_id=uid and a.action_type='investigate'
      and a.round_no=r.round_no
    order by a.created_at desc limit 1;
  end if;

  if r.phase='night' then
    select count(*) into action_total
    from private.malam_roles x
    join public.malam_players p on p.room_id=x.room_id and p.user_id=x.user_id
    where x.room_id=p_room and p.is_alive
      and x.role in ('siluman','paranormal','penjaga');
    select count(*) into action_done from private.malam_actions a
    where a.room_id=p_room and a.round_no=r.round_no and a.phase='night';
  elsif r.phase='voting' then
    select count(*) into action_total from public.malam_players
    where room_id=p_room and is_alive;
    select count(*) into action_done from private.malam_actions
    where room_id=p_room and round_no=r.round_no and phase='voting';
  end if;

  if r.phase='finished' then
    select jsonb_agg(jsonb_build_object(
      'user_id',p.user_id,'nickname',p.nickname,'role',x.role,'is_alive',p.is_alive
    ) order by p.joined_at) into revealed
    from public.malam_players p
    join private.malam_roles x on x.room_id=p.room_id and x.user_id=p.user_id
    where p.room_id=p_room;
  end if;

  return jsonb_build_object(
    'room',to_jsonb(r),
    'players',coalesce(players,'[]'::jsonb),
    'my_role',my_role,
    'my_team',coalesce(my_team,'[]'::jsonb),
    'my_alive',coalesce(my_alive,false),
    'my_action_done',(action_done>0 and exists(
      select 1 from private.malam_actions a
      where a.room_id=p_room and a.round_no=r.round_no
        and a.phase=r.phase and a.actor_id=uid
    )),
    'action_done',action_done,
    'action_total',action_total,
    'investigation',inv,
    'revealed_roles',coalesce(revealed,'[]'::jsonb)
  );
end
$function$;

create or replace function private.malam_resolve_night(p_room uuid)
returns void
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  r public.malam_rooms%rowtype;
  victim uuid;
  guard_id uuid;
  victim_name text;
  pending int;
  siluman_count int;
  village_count int;
  event_text text;
begin
  select * into r from public.malam_rooms where id=p_room for update;
  if not found or r.host_id<>auth.uid() or r.phase<>'night' then
    raise exception 'Hanya host yang dapat menutup fase malam.';
  end if;
  select count(*) into pending
  from private.malam_roles x
  join public.malam_players p on p.room_id=x.room_id and p.user_id=x.user_id
  where x.room_id=p_room and p.is_alive
    and x.role in ('siluman','paranormal','penjaga')
    and not exists (
      select 1 from private.malam_actions a
      where a.room_id=p_room and a.round_no=r.round_no
        and a.phase='night' and a.actor_id=x.user_id
    );
  if pending>0 then raise exception 'Tunggu semua peran malam menyelesaikan aksinya.'; end if;

  select target_id into victim
  from private.malam_actions
  where room_id=p_room and round_no=r.round_no and phase='night' and action_type='attack'
  group by target_id order by count(*) desc,target_id limit 1;
  select target_id into guard_id
  from private.malam_actions
  where room_id=p_room and round_no=r.round_no and phase='night' and action_type='protect'
  limit 1;

  if victim is not null and victim<>guard_id then
    update public.malam_players set is_alive=false where room_id=p_room and user_id=victim;
    select nickname into victim_name from public.malam_players where room_id=p_room and user_id=victim;
    event_text:='Pagi tiba. '||coalesce(victim_name,'Pemain')||' gugur dibunuh Siluman.';
  elsif victim is not null and victim=guard_id then
    select nickname into victim_name from public.malam_players where room_id=p_room and user_id=victim;
    event_text:='Pagi tiba. '||coalesce(victim_name,'Pemain')||' selamat. Serangan Siluman berhasil digagalkan Penjaga.';
  else
    event_text:='Pagi tiba. Tidak ada korban malam ini.';
  end if;

  select count(*) into siluman_count
  from private.malam_roles x join public.malam_players p on p.room_id=x.room_id and p.user_id=x.user_id
  where x.room_id=p_room and p.is_alive and x.role='siluman';
  select count(*) into village_count
  from private.malam_roles x join public.malam_players p on p.room_id=x.room_id and p.user_id=x.user_id
  where x.room_id=p_room and p.is_alive and x.role<>'siluman';

  if siluman_count=0 then
    update public.malam_rooms set phase='finished',status='finished',winner='warga',
      last_event=event_text||' Permainan selesai. Warga berhasil mengusir seluruh Siluman.',
      phase_started_at=now(),updated_at=now() where id=p_room;
  elsif siluman_count>=village_count then
    update public.malam_rooms set phase='finished',status='finished',winner='siluman',
      last_event=event_text||' Permainan selesai. Siluman menguasai desa.',
      phase_started_at=now(),updated_at=now() where id=p_room;
  else
    update public.malam_rooms set phase='discussion',last_event=event_text,
      phase_started_at=now(),updated_at=now() where id=p_room;
  end if;
end
$function$;
