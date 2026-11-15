-- Verify scheduled cleanup enforces the documented Workspace telemetry windows.
insert into public.ghoustory_ai_usage(provider, feature, created_at)
values
  ('fixture', 'expired-ai', now() - interval '91 days'),
  ('fixture', 'recent-ai', now() - interval '89 days');

insert into public.ghoustory_workspace_activity(created_at)
values
  (now() - interval '181 days'),
  (now() - interval '179 days');

select private.cleanup_ghoustory_transient_data();

do $$
begin
  if exists (
    select 1 from public.ghoustory_ai_usage
    where feature = 'expired-ai'
  ) then
    raise exception 'AI usage older than 90 days was not removed';
  end if;
  if not exists (
    select 1 from public.ghoustory_ai_usage
    where feature = 'recent-ai'
  ) then
    raise exception 'Recent AI usage was removed unexpectedly';
  end if;
  if (select count(*) from public.ghoustory_workspace_activity) <> 1
     or exists (
       select 1 from public.ghoustory_workspace_activity
       where created_at < now() - interval '180 days'
     ) then
    raise exception 'Workspace activity retention window is incorrect';
  end if;
end;
$$;
