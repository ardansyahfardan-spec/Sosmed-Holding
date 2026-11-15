-- Return a compact admin-only 30-day AI usage summary without transferring raw log rows.
create or replace function public.ghoustory_workspace_ai_usage_count()
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
