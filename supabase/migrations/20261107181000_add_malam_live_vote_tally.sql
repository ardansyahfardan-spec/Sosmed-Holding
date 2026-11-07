-- Expose anonymous per-player vote totals during the voting phase.
-- Voter identities remain private; only aggregate counts are returned.
create or replace function private.malam_get_vote_tally(p_room uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  phase_name text;
  tally jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.malam_players
    where room_id=p_room and user_id=auth.uid()
  ) then
    raise exception 'Kamu bukan anggota ruang ini.';
  end if;

  select phase into phase_name from public.malam_rooms where id=p_room;
  if phase_name is distinct from 'voting' then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id',p.user_id,
      'nickname',p.nickname,
      'votes',coalesce(v.vote_count,0)
    ) order by coalesce(v.vote_count,0) desc,p.joined_at
  ),'[]'::jsonb)
  into tally
  from public.malam_players p
  left join lateral (
    select count(*)::int as vote_count
    from private.malam_actions a
    where a.room_id=p_room
      and a.round_no=(select round_no from public.malam_rooms where id=p_room)
      and a.phase='voting'
      and a.action_type='vote'
      and a.target_id=p.user_id
  ) v on true
  where p.room_id=p_room and p.is_alive;

  return tally;
end
$function$;

revoke all on function private.malam_get_vote_tally(uuid) from public;
grant execute on function private.malam_get_vote_tally(uuid) to authenticated;

create or replace function public.malam_get_state(p_room uuid)
returns jsonb
language sql
set search_path to 'public','private','pg_temp'
as $function$
  select private.malam_get_state(p_room)
    || jsonb_build_object('vote_tally', private.malam_get_vote_tally(p_room))
$function$;
