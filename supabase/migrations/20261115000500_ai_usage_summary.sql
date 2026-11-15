-- Replace the scalar count with a compact admin-only 30-day token summary.
drop function if exists public.ghoustory_workspace_ai_usage_count();

create function public.ghoustory_workspace_ai_usage_count()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when private.is_ghoustory_app_admin()
      then (
        select jsonb_build_object(
          'requests', count(*),
          'inputTokens', coalesce(sum(input_tokens), 0),
          'outputTokens', coalesce(sum(output_tokens), 0)
        )
        from public.ghoustory_ai_usage
        where created_at >= now() - interval '30 days'
      )
    else null
  end;
$$;

revoke all on function public.ghoustory_workspace_ai_usage_count() from public, anon;
grant execute on function public.ghoustory_workspace_ai_usage_count() to authenticated;
