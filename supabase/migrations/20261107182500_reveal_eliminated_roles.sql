-- Reveal each eliminated player's role to every room member.
-- Preserve the anonymous live vote tally in the public state response.
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
      'vote_tally',private.malam_get_vote_tally(p_room)
    )
  from base
$function$;
