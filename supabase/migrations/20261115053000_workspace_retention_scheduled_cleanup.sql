-- Make Workspace log retention deterministic by reusing the existing
-- five-minute transient-data cleanup job (cron.job id 6 in this project).
-- The old insert-trigger cleanup remains as a lightweight opportunistic fallback.
create or replace function private.cleanup_ghoustory_transient_data()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  -- JADI WNI: closed/completed rooms get 10 minutes; inactive rooms expire after 24 hours.
  delete from public.jadi_wni_rooms
  where (
    lower(coalesce(status, '')) in ('closed', 'completed', 'complete', 'finished')
    and updated_at < pg_catalog.now() - interval '10 minutes'
  ) or (
    lower(coalesce(status, '')) not in ('closed', 'completed', 'complete', 'finished')
    and updated_at < pg_catalog.now() - interval '24 hours'
  );

  -- Remove expired invite-attempt counters after the rolling window and lock expire.
  delete from private.ghoustory_group_invite_attempts
  where window_started_at < pg_catalog.now() - interval '1 day'
    and (locked_until is null or locked_until < pg_catalog.now());

  -- Remove long-stale push endpoints; clients refresh updated_at when registering.
  delete from public.ghoustory_push_subscriptions
  where updated_at < pg_catalog.now() - interval '180 days';

  -- Enforce Workspace telemetry retention even when no new rows are inserted.
  delete from public.ghoustory_ai_usage
  where created_at < pg_catalog.now() - interval '90 days';

  delete from public.ghoustory_workspace_activity
  where created_at < pg_catalog.now() - interval '180 days';
end;
$function$;
