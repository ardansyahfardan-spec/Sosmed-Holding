-- Reduce the automatic discussion phase from 180 seconds to 60 seconds.
CREATE OR REPLACE FUNCTION private.malam_advance_if_due(p_room uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  r public.malam_rooms%rowtype;
  victim uuid;
  guard_id uuid;
  eliminated uuid;
  victim_name text;
  eliminated_name text;
  siluman_count int;
  village_count int;
  top_votes int;
  next_votes int;
begin
  if auth.uid() is null then
    raise exception 'Kamu harus masuk untuk mengikuti permainan.';
  end if;

  select * into r
  from public.malam_rooms
  where id = p_room
  for update;

  if not found then
    raise exception 'Ruang permainan tidak ditemukan.';
  end if;

  if not exists (
    select 1 from public.malam_players
    where room_id = p_room and user_id = auth.uid()
  ) then
    raise exception 'Kamu bukan anggota ruang ini.';
  end if;

  if r.phase = 'night' and r.phase_started_at <= now() - interval '60 seconds' then
    select target_id into victim
    from private.malam_actions
    where room_id = p_room and round_no = r.round_no
      and phase = 'night' and action_type = 'attack'
    group by target_id
    order by count(*) desc, target_id
    limit 1;

    select target_id into guard_id
    from private.malam_actions
    where room_id = p_room and round_no = r.round_no
      and phase = 'night' and action_type = 'protect'
    order by created_at desc
    limit 1;

    if victim is not null and victim <> guard_id then
      update public.malam_players
      set is_alive = false
      where room_id = p_room and user_id = victim and is_alive;
      select nickname into victim_name
      from public.malam_players where room_id = p_room and user_id = victim;
    end if;

    select count(*) into siluman_count
    from private.malam_roles x
    join public.malam_players p on p.room_id=x.room_id and p.user_id=x.user_id
    where x.room_id=p_room and p.is_alive and x.role='siluman';

    select count(*) into village_count
    from private.malam_roles x
    join public.malam_players p on p.room_id=x.room_id and p.user_id=x.user_id
    where x.room_id=p_room and p.is_alive and x.role<>'siluman';

    if siluman_count = 0 then
      update public.malam_rooms
      set phase='finished', status='finished', winner='warga',
          last_event='Permainan selesai. Warga berhasil mengusir seluruh Siluman.',
          phase_started_at=now(), updated_at=now()
      where id=p_room;
    elsif siluman_count >= village_count then
      update public.malam_rooms
      set phase='finished', status='finished', winner='siluman',
          last_event='Permainan selesai. Siluman menguasai desa.',
          phase_started_at=now(), updated_at=now()
      where id=p_room;
    else
      update public.malam_rooms
      set phase='discussion',
          last_event=case
            when victim is not null and victim <> guard_id
              then 'Pagi tiba. ' || coalesce(victim_name,'Seseorang') || ' ditemukan gugur.'
            when victim is not null and victim = guard_id
              then 'Pagi tiba. Serangan Siluman berhasil digagalkan Penjaga. Tidak ada korban.'
            else 'Pagi tiba. Tidak ada korban malam ini.'
          end,
          phase_started_at=now(), updated_at=now()
      where id=p_room;
    end if;
    return true;

  elsif r.phase = 'discussion' and r.phase_started_at <= now() - interval '60 seconds' then
    update public.malam_rooms
    set phase='voting',
        last_event='Waktu diskusi selesai. Voting otomatis dibuka. Pilih pemain yang paling kamu curigai.',
        phase_started_at=now(), updated_at=now()
    where id=p_room;
    return true;

  elsif r.phase = 'voting' and r.phase_started_at <= now() - interval '45 seconds' then
    select max(v.n), max(v.n) filter (where v.rn=2)
    into top_votes, next_votes
    from (
      select count(*) n, row_number() over(order by count(*) desc) rn
      from private.malam_actions
      where room_id=p_room and round_no=r.round_no
        and phase='voting' and action_type='vote'
      group by target_id
    ) v
    where v.rn <= 2;

    if coalesce(top_votes,0) > coalesce(next_votes,0) then
      select a.target_id into eliminated
      from private.malam_actions a
      join public.malam_players p on p.room_id=a.room_id and p.user_id=a.target_id and p.is_alive
      where a.room_id=p_room and a.round_no=r.round_no
        and a.phase='voting' and a.action_type='vote'
      group by a.target_id
      order by count(*) desc, a.target_id
      limit 1;
    end if;

    if eliminated is not null then
      update public.malam_players
      set is_alive=false
      where room_id=p_room and user_id=eliminated and is_alive;
      select nickname into eliminated_name
      from public.malam_players where room_id=p_room and user_id=eliminated;
    end if;

    select count(*) into siluman_count
    from private.malam_roles x
    join public.malam_players p on p.room_id=x.room_id and p.user_id=x.user_id
    where x.room_id=p_room and p.is_alive and x.role='siluman';

    select count(*) into village_count
    from private.malam_roles x
    join public.malam_players p on p.room_id=x.room_id and p.user_id=x.user_id
    where x.room_id=p_room and p.is_alive and x.role<>'siluman';

    if siluman_count = 0 then
      update public.malam_rooms
      set phase='finished', status='finished', winner='warga',
          last_event='Permainan selesai. Warga berhasil mengusir seluruh Siluman.',
          phase_started_at=now(), updated_at=now()
      where id=p_room;
    elsif siluman_count >= village_count then
      update public.malam_rooms
      set phase='finished', status='finished', winner='siluman',
          last_event='Permainan selesai. Siluman menguasai desa.',
          phase_started_at=now(), updated_at=now()
      where id=p_room;
    else
      update public.malam_rooms
      set phase='night', round_no=round_no+1,
          last_event=case
            when eliminated is null
              then 'Voting selesai imbang atau belum ada suara. Tidak ada yang dikeluarkan. Malam kembali tiba.'
            else coalesce(eliminated_name,'Seseorang') || ' dikeluarkan melalui voting. Malam kembali tiba.'
          end,
          phase_started_at=now(), updated_at=now()
      where id=p_room;
    end if;
    return true;
  end if;

  return false;
end;
$function$

