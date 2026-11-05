-- Improve Malam Terlarang night resolution and validate chat input.
-- If a night elimination creates parity, the game ends immediately instead of
-- incorrectly allowing the village one additional daytime vote.

create or replace function private.malam_resolve_night(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  r public.malam_rooms%rowtype;
  victim uuid;
  guard_id uuid;
  victim_name text;
  pending int;
  siluman_count int;
  village_count int;
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
  if pending>0 then
    raise exception 'Tunggu semua peran malam menyelesaikan aksinya.';
  end if;

  select target_id into victim
  from private.malam_actions
  where room_id=p_room and round_no=r.round_no
    and phase='night' and action_type='attack'
  group by target_id order by count(*) desc, target_id limit 1;

  select target_id into guard_id
  from private.malam_actions
  where room_id=p_room and round_no=r.round_no
    and phase='night' and action_type='protect'
  limit 1;

  if victim is not null and victim<>guard_id then
    update public.malam_players set is_alive=false
    where room_id=p_room and user_id=victim;
    select nickname into victim_name
    from public.malam_players where room_id=p_room and user_id=victim;
  end if;

  select count(*) into siluman_count
  from private.malam_roles x
  join public.malam_players p on p.room_id=x.room_id and p.user_id=x.user_id
  where x.room_id=p_room and p.is_alive and x.role='siluman';

  select count(*) into village_count
  from private.malam_roles x
  join public.malam_players p on p.room_id=x.room_id and p.user_id=x.user_id
  where x.room_id=p_room and p.is_alive and x.role<>'siluman';

  if siluman_count=0 then
    update public.malam_rooms
    set phase='finished', status='finished', winner='warga',
        last_event='Permainan selesai. Warga berhasil mengusir seluruh Siluman.',
        updated_at=now()
    where id=p_room;
  elsif siluman_count>=village_count then
    update public.malam_rooms
    set phase='finished', status='finished', winner='siluman',
        last_event='Permainan selesai. Siluman menguasai desa.',
        updated_at=now()
    where id=p_room;
  else
    update public.malam_rooms
    set phase='day', last_event=case
      when victim is not null and victim<>guard_id
        then 'Pagi tiba. '||coalesce(victim_name,'Seseorang')||' ditemukan tereliminasi.'
      else 'Pagi tiba. Tidak ada korban malam ini.'
    end,
    updated_at=now()
    where id=p_room;
  end if;
end;
$$;

create or replace function private.malam_send_chat(p_room uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  nm text;
  clean_body text := trim(coalesce(p_body,''));
begin
  select nickname into nm
  from public.malam_players
  where room_id=p_room and user_id=auth.uid();

  if nm is null then
    raise exception 'Kamu bukan anggota ruang ini.';
  end if;
  if char_length(clean_body) not between 1 and 500 then
    raise exception 'Pesan harus berisi 1–500 karakter.';
  end if;

  insert into public.malam_messages(room_id,user_id,nickname,body)
  values(p_room,auth.uid(),nm,clean_body);
end;
$$;
