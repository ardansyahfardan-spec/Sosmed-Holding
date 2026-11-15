-- Retain only the useful recent window for new Workspace telemetry.
-- Cleanup runs once per 50 inserts to avoid a delete scan on every AI/activity write.
create or replace function private.prune_ghoustory_workspace_retention()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_table_name = 'ghoustory_ai_usage' and mod(new.id, 50) = 0 then
    delete from public.ghoustory_ai_usage
    where created_at < now() - interval '90 days';
  elsif tg_table_name = 'ghoustory_workspace_activity' and mod(new.id, 50) = 0 then
    delete from public.ghoustory_workspace_activity
    where created_at < now() - interval '180 days';
  end if;
  return new;
end;
$$;

revoke all on function private.prune_ghoustory_workspace_retention() from public, anon, authenticated;

drop trigger if exists ghoustory_ai_usage_retention on public.ghoustory_ai_usage;
create trigger ghoustory_ai_usage_retention
after insert on public.ghoustory_ai_usage
for each row execute function private.prune_ghoustory_workspace_retention();

drop trigger if exists ghoustory_workspace_activity_retention on public.ghoustory_workspace_activity;
create trigger ghoustory_workspace_activity_retention
after insert on public.ghoustory_workspace_activity
for each row execute function private.prune_ghoustory_workspace_retention();
