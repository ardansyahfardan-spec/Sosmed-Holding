-- Merge only changed top-level app_state keys while preserving optimistic concurrency.
create or replace function public.ghoustory_patch_app_state(
  p_patch jsonb,
  p_remove_keys text[],
  p_expected_updated_at timestamptz
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated_at timestamptz;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Patch data must be a JSON object.';
  end if;

  update public.app_state
     set data = (coalesce(data, '{}'::jsonb) - coalesce(p_remove_keys, array[]::text[])) || p_patch,
         updated_by = (select auth.uid()),
         updated_at = clock_timestamp()
   where id = 'ghoustory'
     and updated_at = p_expected_updated_at
  returning updated_at into v_updated_at;

  return v_updated_at;
end;
$$;

revoke all on function public.ghoustory_patch_app_state(jsonb, text[], timestamptz) from public, anon;
grant execute on function public.ghoustory_patch_app_state(jsonb, text[], timestamptz) to authenticated;
