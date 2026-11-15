-- Verify the admin-only AI metrics RPC returns the complete 30-day summary.
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000002');
insert into private.ghoustory_app_admins(user_id) values ('00000000-0000-4000-8000-000000000002');
insert into public.ghoustory_ai_usage(user_id,provider,model,feature,input_tokens,output_tokens,status,created_at)
values ('00000000-0000-4000-8000-000000000002','test','fixture','test',101,202,'success',now());

do $$
begin
  if not has_function_privilege('authenticated', 'public.ghoustory_workspace_ai_usage_count()', 'EXECUTE') then
    raise exception 'Authenticated role cannot execute the AI metrics RPC';
  end if;
  if has_function_privilege('anon', 'public.ghoustory_workspace_ai_usage_count()', 'EXECUTE') then
    raise exception 'Anon role can execute the AI metrics RPC';
  end if;
end;
$$;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
set local role authenticated;
do $$
declare
  metrics jsonb;
begin
  metrics := public.ghoustory_workspace_ai_usage_count();
  if jsonb_typeof(metrics) <> 'object'
     or metrics->>'requests' <> '1'
     or metrics->>'inputTokens' <> '101'
     or metrics->>'outputTokens' <> '202' then
    raise exception 'Admin AI metrics incorrect: %', metrics;
  end if;
end;
$$;
rollback;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000099', true);
set local role authenticated;
do $$
begin
  if public.ghoustory_workspace_ai_usage_count() is not null then
    raise exception 'Non-admin received AI usage metrics';
  end if;
end;
$$;
rollback;
