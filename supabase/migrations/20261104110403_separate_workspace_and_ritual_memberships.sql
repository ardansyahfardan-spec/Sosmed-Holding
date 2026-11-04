-- Separate workspace access from RITUAL CREW membership.
-- Existing workspace members are retained as current RITUAL CREW members.

create table if not exists private.ghoustory_ritual_crew_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now()
);
alter table private.ghoustory_ritual_crew_memberships enable row level security;
revoke all on table private.ghoustory_ritual_crew_memberships from public, anon, authenticated;

insert into private.ghoustory_ritual_crew_memberships (user_id, joined_at)
select user_id, joined_at
from private.ghoustory_group_memberships
on conflict (user_id) do nothing;

create table if not exists private.ghoustory_app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.ghoustory_app_admins enable row level security;
revoke all on table private.ghoustory_app_admins from public, anon, authenticated;

do $$
declare v_admin_id uuid;
begin
  select id into v_admin_id
  from auth.users
  where lower(email) = lower('ardansyahfardan@gmail.com')
  limit 1;

  if v_admin_id is null then
    raise exception 'Admin utama belum ditemukan di Supabase Auth.';
  end if;

  insert into private.ghoustory_app_admins(user_id)
  values (v_admin_id)
  on conflict (user_id) do nothing;
end $$;

create or replace function public.is_ghoustory_workspace_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.ghoustory_group_memberships m
    where m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_ghoustory_group_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.ghoustory_ritual_crew_memberships m
    where m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_ghoustory_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.ghoustory_app_admins a
    where a.user_id = (select auth.uid())
  );
$$;

create or replace function private.add_ritual_membership_for_workspace_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.ghoustory_ritual_crew_memberships(user_id)
  values (new.user_id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.add_ritual_membership_for_workspace_member() from public, anon, authenticated;

drop trigger if exists ghoustory_add_ritual_membership on private.ghoustory_group_memberships;
create trigger ghoustory_add_ritual_membership
after insert on private.ghoustory_group_memberships
for each row execute function private.add_ritual_membership_for_workspace_member();

create or replace function public.kick_ghoustory_ritual_member(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
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

revoke all on function public.is_ghoustory_workspace_member() from public, anon;
revoke all on function public.is_ghoustory_group_member() from public, anon;
revoke all on function public.is_ghoustory_admin() from public, anon;
revoke all on function public.kick_ghoustory_ritual_member(uuid) from public, anon;
grant execute on function public.is_ghoustory_workspace_member() to authenticated;
grant execute on function public.is_ghoustory_group_member() to authenticated;
grant execute on function public.is_ghoustory_admin() to authenticated;
grant execute on function public.kick_ghoustory_ritual_member(uuid) to authenticated;

drop policy if exists "Authenticated users can read shared Ghoustory state" on public.app_state;
drop policy if exists "Authenticated users can create shared Ghoustory state" on public.app_state;
drop policy if exists "Authenticated users can update shared Ghoustory state" on public.app_state;
create policy "Workspace members can read shared Ghoustory state"
on public.app_state for select to authenticated
using (id = 'ghoustory' and public.is_ghoustory_workspace_member());
create policy "Workspace members can create shared Ghoustory state"
on public.app_state for insert to authenticated
with check (id = 'ghoustory' and public.is_ghoustory_workspace_member());
create policy "Workspace members can update shared Ghoustory state"
on public.app_state for update to authenticated
using (id = 'ghoustory' and public.is_ghoustory_workspace_member())
with check (id = 'ghoustory' and public.is_ghoustory_workspace_member());

drop policy if exists "Profiles visible to authenticated" on public.ghoustory_profiles;
create policy "Workspace members can view crew profiles"
on public.ghoustory_profiles for select to authenticated
using (public.is_ghoustory_workspace_member());

drop policy if exists "Authenticated team can read chat" on public.ghoustory_chat_messages;
drop policy if exists "Users can send own chat messages" on public.ghoustory_chat_messages;
drop policy if exists "Users edit or delete own group messages" on public.ghoustory_chat_messages;
create policy "RITUAL CREW members can read chat"
on public.ghoustory_chat_messages for select to authenticated
using (public.is_ghoustory_group_member());
create policy "RITUAL CREW members send own chat messages"
on public.ghoustory_chat_messages for insert to authenticated
with check (public.is_ghoustory_group_member() and sender_id = (select auth.uid()));
create policy "RITUAL CREW members edit own group messages"
on public.ghoustory_chat_messages for update to authenticated
using (public.is_ghoustory_group_member() and sender_id = (select auth.uid()))
with check (public.is_ghoustory_group_member() and sender_id = (select auth.uid()));

drop policy if exists "authenticated members pin group messages" on public.ghoustory_group_message_pins;
drop policy if exists "authenticated members unpin group messages" on public.ghoustory_group_message_pins;
drop policy if exists "group pins readable by authenticated" on public.ghoustory_group_message_pins;
create policy "RITUAL CREW members read group pins"
on public.ghoustory_group_message_pins for select to authenticated
using (public.is_ghoustory_group_member());
create policy "RITUAL CREW members pin group messages"
on public.ghoustory_group_message_pins for insert to authenticated
with check (public.is_ghoustory_group_member() and pinned_by = (select auth.uid()));
create policy "RITUAL CREW members unpin own group pins"
on public.ghoustory_group_message_pins for delete to authenticated
using (public.is_ghoustory_group_member() and pinned_by = (select auth.uid()));

drop policy if exists "group reactions readable by authenticated" on public.ghoustory_group_message_reactions;
drop policy if exists "users add own group reactions" on public.ghoustory_group_message_reactions;
drop policy if exists "users remove own group reactions" on public.ghoustory_group_message_reactions;
create policy "RITUAL CREW members read group reactions"
on public.ghoustory_group_message_reactions for select to authenticated
using (public.is_ghoustory_group_member());
create policy "RITUAL CREW members add own group reactions"
on public.ghoustory_group_message_reactions for insert to authenticated
with check (public.is_ghoustory_group_member() and user_id = (select auth.uid()));
create policy "RITUAL CREW members remove own group reactions"
on public.ghoustory_group_message_reactions for delete to authenticated
using (public.is_ghoustory_group_member() and user_id = (select auth.uid()));

drop policy if exists "Authenticated team can view group read receipts" on public.ghoustory_group_message_reads;
drop policy if exists "Members mark group messages as read" on public.ghoustory_group_message_reads;
create policy "RITUAL CREW members view group read receipts"
on public.ghoustory_group_message_reads for select to authenticated
using (public.is_ghoustory_group_member());
create policy "RITUAL CREW members mark group messages as read"
on public.ghoustory_group_message_reads for insert to authenticated
with check (
  public.is_ghoustory_group_member()
  and user_id = (select auth.uid())
  and exists (
    select 1 from public.ghoustory_chat_messages m
    where m.id = ghoustory_group_message_reads.message_id
      and m.sender_id <> (select auth.uid())
  )
);

drop policy if exists "Crew access attendance" on public.ghoustory_attendance_responses;
create policy "Workspace members access attendance"
on public.ghoustory_attendance_responses for all to authenticated
using (public.is_ghoustory_workspace_member())
with check (public.is_ghoustory_workspace_member() and user_id = (select auth.uid()));

drop policy if exists "Group members manage assignments" on public.ghoustory_schedule_assignments;
drop policy if exists "Group members read assignments" on public.ghoustory_schedule_assignments;
create policy "Workspace members manage assignments"
on public.ghoustory_schedule_assignments for all to authenticated
using (public.is_ghoustory_workspace_member())
with check (public.is_ghoustory_workspace_member());

drop policy if exists "Crew create schedule change requests" on public.ghoustory_schedule_change_requests;
drop policy if exists "Crew read schedule change requests" on public.ghoustory_schedule_change_requests;
drop policy if exists "Crew update schedule change requests" on public.ghoustory_schedule_change_requests;
create policy "Workspace members create schedule change requests"
on public.ghoustory_schedule_change_requests for insert to authenticated
with check (public.is_ghoustory_workspace_member() and proposed_by = (select auth.uid()));
create policy "Workspace members read schedule change requests"
on public.ghoustory_schedule_change_requests for select to authenticated
using (public.is_ghoustory_workspace_member());
create policy "Workspace members update schedule change requests"
on public.ghoustory_schedule_change_requests for update to authenticated
using (public.is_ghoustory_workspace_member())
with check (public.is_ghoustory_workspace_member());

drop policy if exists "Crew access schedule change votes" on public.ghoustory_schedule_change_votes;
create policy "Workspace members access schedule change votes"
on public.ghoustory_schedule_change_votes for all to authenticated
using (public.is_ghoustory_workspace_member())
with check (public.is_ghoustory_workspace_member() and user_id = (select auth.uid()));

drop policy if exists "Group members create schedules" on public.ghoustory_schedules;
drop policy if exists "Group members delete schedules" on public.ghoustory_schedules;
drop policy if exists "Group members read schedules" on public.ghoustory_schedules;
drop policy if exists "Group members update schedules" on public.ghoustory_schedules;
create policy "Workspace members create schedules"
on public.ghoustory_schedules for insert to authenticated
with check (public.is_ghoustory_workspace_member() and created_by = (select auth.uid()));
create policy "Workspace members delete schedules"
on public.ghoustory_schedules for delete to authenticated
using (public.is_ghoustory_workspace_member());
create policy "Workspace members read schedules"
on public.ghoustory_schedules for select to authenticated
using (public.is_ghoustory_workspace_member());
create policy "Workspace members update schedules"
on public.ghoustory_schedules for update to authenticated
using (public.is_ghoustory_workspace_member())
with check (public.is_ghoustory_workspace_member());

revoke all on function public.check_ghoustory_group_access(text) from public, anon;
grant execute on function public.check_ghoustory_group_access(text) to authenticated;
revoke all on function public.is_ghoustory_schedule_assignee(text) from public, anon;
grant execute on function public.is_ghoustory_schedule_assignee(text) to authenticated;
