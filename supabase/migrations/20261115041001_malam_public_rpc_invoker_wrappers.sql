-- Move the elevated Malam state aggregation behind a private RPC helper.
-- The public endpoint becomes SECURITY INVOKER while preserving its response shape.
CREATE OR REPLACE FUNCTION private.malam_get_state_expanded(p_room uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  with base as (
    select private.malam_get_state(p_room) as state
  )
  select state || jsonb_build_object(
    'players', coalesce((
      select jsonb_agg(player || jsonb_build_object(
        'avatar_url', profile.avatar_url,
        'revealed_role', case when (player->>'is_alive')::boolean is false then role.role else null end
      ) order by ord)
      from jsonb_array_elements(state->'players') with ordinality as p(player,ord)
      left join public.ghoustory_profiles profile on profile.user_id=(player->>'user_id')::uuid
      left join private.malam_roles role on role.room_id=p_room and role.user_id=(player->>'user_id')::uuid
    ),'[]'::jsonb),
    'vote_tally', private.malam_get_vote_tally(p_room),
    'suspicion_marks', coalesce((
      select jsonb_agg(jsonb_build_object('actor_id',a.actor_id,'target_id',a.target_id,'actor_nickname',voter.nickname) order by a.created_at)
      from private.malam_actions a
      join public.malam_players voter on voter.room_id=a.room_id and voter.user_id=a.actor_id
      where a.room_id=p_room and a.round_no=(state->'room'->>'round_no')::int and a.phase='voting' and a.action_type='vote'
    ),'[]'::jsonb),
    'protected_target_id', (
      select a.target_id from private.malam_actions a
      where a.room_id=p_room and a.round_no=(state->'room'->>'round_no')::int and a.phase='night' and a.action_type='protect'
      order by a.created_at desc limit 1
    ),
    'my_action_target', (
      select a.target_id from private.malam_actions a
      where a.room_id=p_room and a.actor_id=auth.uid() and a.round_no=(state->'room'->>'round_no')::int and a.phase=(state->'room'->>'phase')
      order by a.created_at desc limit 1
    ),
    'team_action_targets', case when exists(
      select 1 from private.malam_roles mine where mine.room_id=p_room and mine.user_id=auth.uid() and mine.role='siluman'
    ) then coalesce((
      select jsonb_agg(jsonb_build_object('actor_id',a.actor_id,'target_id',a.target_id,'nickname',pl.nickname) order by a.created_at)
      from private.malam_actions a
      join private.malam_roles teammate on teammate.room_id=a.room_id and teammate.user_id=a.actor_id and teammate.role='siluman'
      join public.malam_players pl on pl.room_id=a.room_id and pl.user_id=a.actor_id
      where a.room_id=p_room and a.round_no=(state->'room'->>'round_no')::int and a.phase='night' and a.action_type='attack' and pl.is_alive
    ),'[]'::jsonb) else '[]'::jsonb end,
    'investigation_name', state->'investigation'->>'nickname',
    'investigation', state->'investigation'->>'role',
    'investigation_detail', state->'investigation',
    'revealed_roles', coalesce((
      select jsonb_agg(jsonb_build_object('user_id',p.user_id,'nickname',p.nickname,'role',x.role,'is_alive',p.is_alive) order by p.joined_at)
      from public.malam_players p
      join private.malam_roles x on x.room_id=p.room_id and x.user_id=p.user_id
      where p.room_id=p_room and (not p.is_alive or (state->'room'->>'phase')='finished')
    ),'[]'::jsonb)
  )
  from base
$function$;

REVOKE EXECUTE ON FUNCTION private.malam_get_state_expanded(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.malam_get_state_expanded(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.malam_get_state(p_room uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  select private.malam_get_state_expanded(p_room)
$function$;

ALTER FUNCTION public.malam_process_ai(uuid) SECURITY INVOKER;