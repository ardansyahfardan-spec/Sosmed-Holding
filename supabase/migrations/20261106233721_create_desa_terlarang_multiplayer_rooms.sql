create table if not exists public.desa_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby','playing','finished')),
  max_players smallint not null default 5 check (max_players between 1 and 5),
  game_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.desa_players (
  room_id uuid not null references public.desa_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 24),
  is_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id,user_id)
);
create index if not exists desa_players_user_room_idx on public.desa_players(user_id,room_id);
alter table public.desa_rooms enable row level security;
alter table public.desa_players enable row level security;
grant select on public.desa_rooms, public.desa_players to authenticated;
drop policy if exists desa_rooms_member_read on public.desa_rooms;
create policy desa_rooms_member_read on public.desa_rooms for select to authenticated
using (exists(select 1 from public.desa_players p where p.room_id=id and p.user_id=(select auth.uid())));
drop policy if exists desa_players_member_read on public.desa_players;
create policy desa_players_member_read on public.desa_players for select to authenticated
using (exists(select 1 from public.desa_players me where me.room_id=desa_players.room_id and me.user_id=(select auth.uid())));
create or replace function private.desa_is_member(p_room uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.desa_players p where p.room_id=p_room and p.user_id=(select auth.uid())); $$;
create or replace function private.desa_create_room(p_nickname text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=(select auth.uid()); v_room uuid; v_code text;
begin
 if v_uid is null then raise exception 'Silakan login terlebih dahulu.'; end if;
 if char_length(trim(coalesce(p_nickname,''))) not between 2 and 24 then raise exception 'Nama pemain harus 2–24 karakter.'; end if;
 loop
   v_code:=upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,6));
   exit when not exists(select 1 from public.desa_rooms r where r.code=v_code);
 end loop;
 insert into public.desa_rooms(code,host_id) values(v_code,v_uid) returning id into v_room;
 insert into public.desa_players(room_id,user_id,nickname) values(v_room,v_uid,trim(p_nickname));
 return jsonb_build_object('room_id',v_room,'code',v_code);
end $$;
create or replace function private.desa_join_room(p_code text,p_nickname text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=(select auth.uid()); r public.desa_rooms%rowtype; v_count integer;
begin
 if v_uid is null then raise exception 'Silakan login terlebih dahulu.'; end if;
 if char_length(trim(coalesce(p_nickname,''))) not between 2 and 24 then raise exception 'Nama pemain harus 2–24 karakter.'; end if;
 select * into r from public.desa_rooms where code=upper(trim(coalesce(p_code,''))) for update;
 if not found or r.status<>'lobby' then raise exception 'Kode ruang tidak ditemukan atau permainan sudah dimulai.'; end if;
 if not exists(select 1 from public.desa_players p where p.room_id=r.id and p.user_id=v_uid) then
   select count(*) into v_count from public.desa_players p where p.room_id=r.id;
   if v_count>=r.max_players then raise exception 'Ruang sudah penuh (maksimal 5 pemain).'; end if;
   insert into public.desa_players(room_id,user_id,nickname) values(r.id,v_uid,trim(p_nickname));
 else
   update public.desa_players set nickname=trim(p_nickname) where room_id=r.id and user_id=v_uid;
 end if;
 return jsonb_build_object('room_id',r.id,'code',r.code);
end $$;
create or replace function private.desa_get_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare r public.desa_rooms%rowtype; v_players jsonb;
begin
 if not private.desa_is_member(p_room) then raise exception 'Kamu bukan anggota ruang ini.'; end if;
 select * into r from public.desa_rooms where id=p_room;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'nickname',p.nickname,'is_ready',p.is_ready,'is_host',(p.user_id=r.host_id)) order by p.joined_at,p.user_id),'[]'::jsonb)
 into v_players from public.desa_players p where p.room_id=p_room;
 return jsonb_build_object('room',to_jsonb(r),'players',v_players);
end $$;
create or replace function private.desa_set_ready(p_room uuid,p_ready boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
 if not exists(select 1 from public.desa_rooms where id=p_room and status='lobby') then raise exception 'Ruang tidak sedang menunggu pemain.'; end if;
 update public.desa_players set is_ready=p_ready where room_id=p_room and user_id=(select auth.uid());
 if not found then raise exception 'Kamu bukan anggota ruang ini.'; end if;
end $$;
create or replace function private.desa_start_room(p_room uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.desa_rooms%rowtype; v_count integer; v_ready integer;
begin
 select * into r from public.desa_rooms where id=p_room for update;
 if not found or r.host_id is distinct from (select auth.uid()) then raise exception 'Hanya host yang dapat memulai permainan.'; end if;
 if r.status<>'lobby' then raise exception 'Ruang sudah dimulai.'; end if;
 select count(*),count(*) filter(where is_ready) into v_count,v_ready from public.desa_players where room_id=p_room;
 if v_count<1 or v_count>5 then raise exception 'Permainan membutuhkan 1–5 pemain.'; end if;
 if v_count<>v_ready then raise exception 'Semua pemain harus menekan SIAP.'; end if;
 update public.desa_rooms set status='playing',updated_at=now() where id=p_room;
end $$;
create or replace function private.desa_leave_room(p_room uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=(select auth.uid()); r public.desa_rooms%rowtype; v_next uuid;
begin
 select * into r from public.desa_rooms where id=p_room for update;
 if not found or not exists(select 1 from public.desa_players where room_id=p_room and user_id=v_uid) then return; end if;
 delete from public.desa_players where room_id=p_room and user_id=v_uid;
 if not exists(select 1 from public.desa_players where room_id=p_room) then
   delete from public.desa_rooms where id=p_room;
 elsif r.host_id=v_uid then
   select user_id into v_next from public.desa_players where room_id=p_room order by joined_at,user_id limit 1;
   update public.desa_rooms set host_id=v_next,updated_at=now() where id=p_room;
 end if;
end $$;
grant usage on schema private to authenticated;
revoke all on function private.desa_is_member(uuid) from public,anon;
revoke all on function private.desa_create_room(text) from public,anon;
revoke all on function private.desa_join_room(text,text) from public,anon;
revoke all on function private.desa_get_room(uuid) from public,anon;
revoke all on function private.desa_set_ready(uuid,boolean) from public,anon;
revoke all on function private.desa_start_room(uuid) from public,anon;
revoke all on function private.desa_leave_room(uuid) from public,anon;
grant execute on function private.desa_is_member(uuid),private.desa_create_room(text),private.desa_join_room(text,text),private.desa_get_room(uuid),private.desa_set_ready(uuid,boolean),private.desa_start_room(uuid),private.desa_leave_room(uuid) to authenticated;
create or replace function public.desa_create_room(p_nickname text) returns jsonb language sql security invoker set search_path='' as $$ select private.desa_create_room(p_nickname); $$;
create or replace function public.desa_join_room(p_code text,p_nickname text) returns jsonb language sql security invoker set search_path='' as $$ select private.desa_join_room(p_code,p_nickname); $$;
create or replace function public.desa_get_room(p_room uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.desa_get_room(p_room); $$;
create or replace function public.desa_set_ready(p_room uuid,p_ready boolean) returns void language sql security invoker set search_path='' as $$ select private.desa_set_ready(p_room,p_ready); $$;
create or replace function public.desa_start_room(p_room uuid) returns void language sql security invoker set search_path='' as $$ select private.desa_start_room(p_room); $$;
create or replace function public.desa_leave_room(p_room uuid) returns void language sql security invoker set search_path='' as $$ select private.desa_leave_room(p_room); $$;
revoke all on function public.desa_create_room(text),public.desa_join_room(text,text),public.desa_get_room(uuid),public.desa_set_ready(uuid,boolean),public.desa_start_room(uuid),public.desa_leave_room(uuid) from public,anon;
grant execute on function public.desa_create_room(text),public.desa_join_room(text,text),public.desa_get_room(uuid),public.desa_set_ready(uuid,boolean),public.desa_start_room(uuid),public.desa_leave_room(uuid) to authenticated;
drop policy if exists desa_realtime_room_read on realtime.messages;
create policy desa_realtime_room_read on realtime.messages for select to authenticated
using (extension in ('broadcast','presence') and topic like 'desa:%' and exists(
 select 1 from public.desa_players p where p.room_id=nullif(split_part(realtime.topic(),':',2),'')::uuid and p.user_id=(select auth.uid())
));
drop policy if exists desa_realtime_room_write on realtime.messages;
create policy desa_realtime_room_write on realtime.messages for insert to authenticated
with check (extension in ('broadcast','presence') and topic like 'desa:%' and exists(
 select 1 from public.desa_players p where p.room_id=nullif(split_part(realtime.topic(),':',2),'')::uuid and p.user_id=(select auth.uid())
));
