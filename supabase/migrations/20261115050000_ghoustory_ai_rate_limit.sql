-- Per-user AI burst protection. This migration is branch-only until explicitly approved.
create table if not exists private.ghoustory_ai_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

revoke all on table private.ghoustory_ai_rate_limits from PUBLIC, anon, authenticated;

create or replace function public.ghoustory_ai_take_rate_limit()
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_window timestamptz := pg_catalog.date_trunc('minute', pg_catalog.now());
  v_count integer;
begin
  if v_user_id is null then
    return false;
  end if;

  insert into private.ghoustory_ai_rate_limits (
    user_id, window_started_at, request_count, updated_at
  )
  values (v_user_id, v_window, 1, pg_catalog.now())
  on conflict (user_id) do update
    set window_started_at = excluded.window_started_at,
        request_count = case
          when private.ghoustory_ai_rate_limits.window_started_at < excluded.window_started_at then 1
          else private.ghoustory_ai_rate_limits.request_count + 1
        end,
        updated_at = pg_catalog.now()
  returning request_count into v_count;

  -- Allow at most 10 AI requests per user in each minute window.
  return v_count <= 10;
end;
$function$;

revoke all on function public.ghoustory_ai_take_rate_limit() from PUBLIC, anon, authenticated;
grant execute on function public.ghoustory_ai_take_rate_limit() to authenticated;

comment on function public.ghoustory_ai_take_rate_limit()
  is 'Atomically limits each authenticated user to 10 Ghoustory AI requests per minute.';
