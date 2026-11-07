-- Avoid recursive RLS evaluation in room/player membership checks.
drop policy if exists desa_rooms_member_read on public.desa_rooms;
create policy desa_rooms_member_read on public.desa_rooms
for select to authenticated
using (private.desa_is_member(id));

drop policy if exists desa_players_member_read on public.desa_players;
create policy desa_players_member_read on public.desa_players
for select to authenticated
using (private.desa_is_member(room_id));

drop policy if exists desa_realtime_room_read on realtime.messages;
create policy desa_realtime_room_read on realtime.messages
for select to authenticated
using (
  extension in ('broadcast','presence')
  and topic like 'desa:%'
  and private.desa_is_member(
    case
      when split_part(realtime.topic(), ':', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(realtime.topic(), ':', 2)::uuid
      else null
    end
  )
);

drop policy if exists desa_realtime_room_write on realtime.messages;
create policy desa_realtime_room_write on realtime.messages
for insert to authenticated
with check (
  extension in ('broadcast','presence')
  and topic like 'desa:%'
  and private.desa_is_member(
    case
      when split_part(realtime.topic(), ':', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(realtime.topic(), ':', 2)::uuid
      else null
    end
  )
);
