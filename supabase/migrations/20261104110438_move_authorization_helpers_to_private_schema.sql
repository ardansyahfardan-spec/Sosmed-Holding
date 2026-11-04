-- Keep SECURITY DEFINER implementation functions outside the exposed API schema.
create or replace function private.is_ghoustory_workspace_member()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.ghoustory_group_memberships m
    where m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_ghoustory_group_member()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.ghoustory_ritual_crew_memberships m
    where m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_ghoustory_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.ghoustory_app_admins a
    where a.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_ghoustory_schedule_assignee(p_schedule_id text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.ghoustory_schedule_assignments a
    where a.schedule_id = p_schedule_id
      and a.user_id = (select auth.uid())
  );
$$;

create or replace function private.check_ghoustory_group_access(p_password text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_attempts integer;
  v_window timestamptz;
  v_locked_until timestamptz;
  v_next_attempts integer;
begin
  if v_uid is null then
    raise exception 'Silakan login terlebih dahulu.';
  end if;

  if exists (
    select 1 from private.ghoustory_group_memberships m
    where m.user_id = v_uid
  ) then
    return true;
  end if;

  if p_password is null then
    return false;
  end if;

  select a.attempts, a.window_started_at, a.locked_until
    into v_attempts, v_window, v_locked_until
  from private.ghoustory_group_invite_attempts a
  where a.user_id = v_uid
  for update;

  if v_locked_until is not null and v_locked_until > now() then
    raise exception 'Terlalu banyak percobaan. Coba lagi setelah 15 menit.';
  end if;

  if v_window is null or v_window < now() - interval '15 minutes' then
    v_attempts := 0;
    v_window := now();
  end if;

  select c.password_hash into v_hash
  from private.ghoustory_group_invite_config c
  where c.id = true;

  if v_hash is not null and extensions.crypt(p_password, v_hash) = v_hash then
    insert into private.ghoustory_group_memberships (user_id)
    values (v_uid)
    on conflict (user_id) do nothing;

    delete from private.ghoustory_group_invite_attempts where user_id = v_uid;
    return true;
  end if;

  v_next_attempts := coalesce(v_attempts, 0) + 1;
  insert into private.ghoustory_group_invite_attempts
    (user_id, attempts, window_started_at, locked_until)
  values
    (v_uid, v_next_attempts, coalesce(v_window, now()),
     case when v_next_attempts >= 5 then now() + interval '15 minutes' else null end)
  on conflict (user_id) do update
    set attempts = excluded.attempts,
        window_started_at = excluded.window_started_at,
        locked_until = excluded.locked_until;

  return false;
end;
$function$;

create or replace function private.kick_ghoustory_ritual_member(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_deleted integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Silakan login terlebih dahulu.';
  end if;

  if not exists (
    select 1 from private.ghoustory_app_admins a
    where a.user_id = (select auth.uid())
  ) then
    raise exception 'Hanya admin utama yang dapat mengeluarkan anggota grup.';
  end if;

  if p_user_id is null or p_user_id = (select auth.uid()) then
    raise exception 'Akun admin utama tidak dapat dikeluarkan melalui tindakan ini.';
  end if;

  if exists (
    select 1 from private.ghoustory_app_admins a
    where a.user_id = p_user_id
  ) then
    raise exception 'Admin utama tidak dapat dikeluarkan dari grup.';
  end if;

  delete from private.ghoustory_ritual_crew_memberships
  where user_id = p_user_id;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

grant usage on schema private to authenticated;
revoke all on function private.is_ghoustory_workspace_member() from public, anon;
revoke all on function private.is_ghoustory_group_member() from public, anon;
revoke all on function private.is_ghoustory_admin() from public, anon;
revoke all on function private.is_ghoustory_schedule_assignee(text) from public, anon;
revoke all on function private.check_ghoustory_group_access(text) from public, anon;
revoke all on function private.kick_ghoustory_ritual_member(uuid) from public, anon;
grant execute on function private.is_ghoustory_workspace_member() to authenticated;
grant execute on function private.is_ghoustory_group_member() to authenticated;
grant execute on function private.is_ghoustory_admin() to authenticated;
grant execute on function private.is_ghoustory_schedule_assignee(text) to authenticated;
grant execute on function private.check_ghoustory_group_access(text) to authenticated;
grant execute on function private.kick_ghoustory_ritual_member(uuid) to authenticated;

create or replace function public.is_ghoustory_workspace_member()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.is_ghoustory_workspace_member(); $$;

create or replace function public.is_ghoustory_group_member()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.is_ghoustory_group_member(); $$;

create or replace function public.is_ghoustory_admin()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.is_ghoustory_admin(); $$;

create or replace function public.is_ghoustory_schedule_assignee(p_schedule_id text)
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.is_ghoustory_schedule_assignee(p_schedule_id); $$;

create or replace function public.check_ghoustory_group_access(p_password text default null)
returns boolean language sql security invoker set search_path = ''
as $$ select private.check_ghoustory_group_access(p_password); $$;

create or replace function public.kick_ghoustory_ritual_member(p_user_id uuid)
returns boolean language sql security invoker set search_path = ''
as $$ select private.kick_ghoustory_ritual_member(p_user_id); $$;

revoke all on function public.is_ghoustory_workspace_member() from public, anon;
revoke all on function public.is_ghoustory_group_member() from public, anon;
revoke all on function public.is_ghoustory_admin() from public, anon;
revoke all on function public.is_ghoustory_schedule_assignee(text) from public, anon;
revoke all on function public.check_ghoustory_group_access(text) from public, anon;
revoke all on function public.kick_ghoustory_ritual_member(uuid) from public, anon;
grant execute on function public.is_ghoustory_workspace_member() to authenticated;
grant execute on function public.is_ghoustory_group_member() to authenticated;
grant execute on function public.is_ghoustory_admin() to authenticated;
grant execute on function public.is_ghoustory_schedule_assignee(text) to authenticated;
grant execute on function public.check_ghoustory_group_access(text) to authenticated;
grant execute on function public.kick_ghoustory_ritual_member(uuid) to authenticated;

drop policy if exists "Workspace members read assignments" on public.ghoustory_schedule_assignments;
