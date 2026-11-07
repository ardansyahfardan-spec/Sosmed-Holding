create or replace function public.malam_get_state(p_room uuid)
returns jsonb
language sql
set search_path to 'public','private','pg_temp'
as $function$
  with base as (
    select private.malam_get_state(p_room) as state
  )
  select state
    || jsonb_build_object(
      'players',
      coalesce((
        select jsonb_agg(
          player || jsonb_build_object(
            'revealed_role',
            case when coalesce((player->>'is_alive')::boolean,false) then null else roles.role end
          )
          order by ord
        )
        from jsonb_array_elements(coalesce(state->'players','[]'::jsonb))
          with ordinality as p(player,ord)
        left join private.malam_roles roles
          on roles.room_id=p_room and roles.user_id=(player->>'user_id')::uuid
      ),'[]'::jsonb),
      'vote_tally',private.malam_get_vote_tally(p_room),
      'investigation_name',(
        select p.nickname
        from private.malam_actions a
        join public.malam_players p on p.room_id=a.room_id and p.user_id=a.target_id
        join public.malam_rooms r on r.id=a.room_id
        where a.room_id=p_room and a.actor_id=auth.uid()
          and a.round_no=r.round_no and a.phase='night'
          and a.action_type='investigate'
        order by a.created_at desc limit 1
      )
    )
  from base
$function$;
