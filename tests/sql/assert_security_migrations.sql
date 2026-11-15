-- Assert existing and future public tables do not grant TRUNCATE.
do $$
begin
  if has_table_privilege('anon', 'public.permission_probe', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.permission_probe', 'TRUNCATE') then
    raise exception 'TRUNCATE remains granted on an existing public table';
  end if;
  if has_table_privilege('anon', 'public.future_permission_probe', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.future_permission_probe', 'TRUNCATE') then
    raise exception 'TRUNCATE is granted on a future public table';
  end if;
  if has_table_privilege('anon', 'private.ghoustory_ai_rate_limits', 'SELECT')
     or has_table_privilege('authenticated', 'private.ghoustory_ai_rate_limits', 'SELECT') then
    raise exception 'Browser role can directly read the private AI rate-limit table';
  end if;
  if not has_function_privilege('authenticated', 'public.ghoustory_ai_take_rate_limit()', 'EXECUTE') then
    raise exception 'Authenticated role cannot execute the rate-limit RPC';
  end if;
  if has_function_privilege('anon', 'public.ghoustory_ai_take_rate_limit()', 'EXECUTE') then
    raise exception 'Anon role can execute the rate-limit RPC';
  end if;
end;
$$;

-- Exercise the real RPC as an authenticated user: 10 requests allowed, 11th denied.
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001');
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
set local role authenticated;
do $$
declare
  i integer;
  allowed integer := 0;
begin
  for i in 1..11 loop
    if public.ghoustory_ai_take_rate_limit() then
      allowed := allowed + 1;
    end if;
  end loop;
  if allowed <> 10 then
    raise exception 'Expected 10 allowed requests, got %', allowed;
  end if;
end;
$$;
rollback;
