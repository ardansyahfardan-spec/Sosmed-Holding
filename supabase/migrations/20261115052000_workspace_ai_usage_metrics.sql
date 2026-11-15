-- Return complete 30-day AI usage metrics to admins.
-- Non-admin Crew receives NULL, preserving the existing privacy boundary.
DROP FUNCTION IF EXISTS public.ghoustory_workspace_ai_usage_count();

CREATE FUNCTION public.ghoustory_workspace_ai_usage_count()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN private.is_ghoustory_app_admin() THEN (
      SELECT jsonb_build_object(
        'requests', count(*),
        'inputTokens', coalesce(sum(input_tokens), 0),
        'outputTokens', coalesce(sum(output_tokens), 0)
      )
      FROM public.ghoustory_ai_usage
      WHERE created_at >= now() - interval '30 days'
    )
    ELSE NULL
  END;
$function$;

REVOKE ALL ON FUNCTION public.ghoustory_workspace_ai_usage_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ghoustory_workspace_ai_usage_count() TO authenticated;
