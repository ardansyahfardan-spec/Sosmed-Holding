-- Ghoustory Control Room: normalized workspace intake, tasks, activity and AI usage.
-- Existing app_state is intentionally left untouched; no data is migrated or deleted here.

create table if not exists public.ghoustory_workspace_ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 3000),
  category text not null default 'Umum' check (char_length(category) <= 40),
  status text not null default 'new' check (status in ('new','reviewing','accepted','rejected','implemented')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ghoustory_workspace_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 140),
  description text not null default '' check (char_length(description) <= 3000),
  status text not null default 'todo' check (status in ('todo','in_progress','done','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ghoustory_workspace_activity (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null check (entity_type in ('idea','task')),
  entity_id uuid not null,
  action text not null check (action in ('created','updated')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ghoustory_ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  provider text not null,
  model text,
  feature text not null default 'chat',
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  status text not null default 'success' check (status in ('success','error','blocked')),
  created_at timestamptz not null default now()
);

create index if not exists ghoustory_workspace_ideas_created_idx
  on public.ghoustory_workspace_ideas (created_at desc);
create index if not exists ghoustory_workspace_ideas_status_idx
  on public.ghoustory_workspace_ideas (status, created_at desc);
create index if not exists ghoustory_workspace_tasks_created_idx
  on public.ghoustory_workspace_tasks (created_at desc);
create index if not exists ghoustory_workspace_tasks_status_idx
  on public.ghoustory_workspace_tasks (status, priority, due_at);
create index if not exists ghoustory_workspace_tasks_assignee_idx
  on public.ghoustory_workspace_tasks (assigned_to, status, due_at);
create index if not exists ghoustory_workspace_activity_created_idx
  on public.ghoustory_workspace_activity (created_at desc);
create index if not exists ghoustory_ai_usage_created_idx
  on public.ghoustory_ai_usage (created_at desc);

alter table public.ghoustory_workspace_ideas enable row level security;
alter table public.ghoustory_workspace_tasks enable row level security;
alter table public.ghoustory_workspace_activity enable row level security;
alter table public.ghoustory_ai_usage enable row level security;

drop policy if exists "Workspace members read ideas" on public.ghoustory_workspace_ideas;
create policy "Workspace members read ideas"
  on public.ghoustory_workspace_ideas for select to authenticated
  using (private.is_ghoustory_workspace_member() or private.is_ghoustory_app_admin());

drop policy if exists "Members submit own ideas" on public.ghoustory_workspace_ideas;
create policy "Members submit own ideas"
  on public.ghoustory_workspace_ideas for insert to authenticated
  with check ((private.is_ghoustory_workspace_member() or private.is_ghoustory_app_admin()) and created_by = (select auth.uid()));

drop policy if exists "Authors and admins update ideas" on public.ghoustory_workspace_ideas;
create policy "Authors and admins update ideas"
  on public.ghoustory_workspace_ideas for update to authenticated
  using ((private.is_ghoustory_workspace_member() or private.is_ghoustory_app_admin()) and (created_by = (select auth.uid()) or private.is_ghoustory_app_admin()))
  with check ((private.is_ghoustory_workspace_member() or private.is_ghoustory_app_admin()) and (created_by = (select auth.uid()) or private.is_ghoustory_app_admin()));

drop policy if exists "Admins delete ideas" on public.ghoustory_workspace_ideas;
create policy "Admins delete ideas"
  on public.ghoustory_workspace_ideas for delete to authenticated
  using (private.is_ghoustory_app_admin());

drop policy if exists "Workspace members read tasks" on public.ghoustory_workspace_tasks;
create policy "Workspace members read tasks"
  on public.ghoustory_workspace_tasks for select to authenticated
  using (private.is_ghoustory_workspace_member());

drop policy if exists "Members create tasks" on public.ghoustory_workspace_tasks;
create policy "Members create tasks"
  on public.ghoustory_workspace_tasks for insert to authenticated
  with check (private.is_ghoustory_workspace_member() and created_by = (select auth.uid()));

drop policy if exists "Task owners update tasks" on public.ghoustory_workspace_tasks;
create policy "Task owners update tasks"
  on public.ghoustory_workspace_tasks for update to authenticated
  using ((private.is_ghoustory_workspace_member() or private.is_ghoustory_app_admin()) and (created_by = (select auth.uid()) or assigned_to = (select auth.uid()) or private.is_ghoustory_app_admin()))
  with check ((private.is_ghoustory_workspace_member() or private.is_ghoustory_app_admin()) and (created_by = (select auth.uid()) or assigned_to = (select auth.uid()) or private.is_ghoustory_app_admin()));

drop policy if exists "Admins delete tasks" on public.ghoustory_workspace_tasks;
create policy "Admins delete tasks"
  on public.ghoustory_workspace_tasks for delete to authenticated
  using (private.is_ghoustory_app_admin());

drop policy if exists "Workspace members read activity" on public.ghoustory_workspace_activity;
create policy "Workspace members read activity"
  on public.ghoustory_workspace_activity for select to authenticated
  using (private.is_ghoustory_workspace_member());

drop policy if exists "Admins read AI usage" on public.ghoustory_ai_usage;
create policy "Admins read AI usage"
  on public.ghoustory_ai_usage for select to authenticated
  using (private.is_ghoustory_app_admin());

create or replace function private.touch_workspace_item_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.log_workspace_item_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_row jsonb;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  insert into public.ghoustory_workspace_activity
    (actor_id, entity_type, entity_id, action, details)
  values (
    v_actor,
    case when tg_table_name = 'ghoustory_workspace_ideas' then 'idea' else 'task' end,
    (v_row ->> 'id')::uuid,
    case when tg_op = 'INSERT' then 'created' else 'updated' end,
    jsonb_strip_nulls(jsonb_build_object('title', v_row ->> 'title', 'status', v_row ->> 'status'))
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists ghoustory_workspace_ideas_touch on public.ghoustory_workspace_ideas;
create trigger ghoustory_workspace_ideas_touch before update on public.ghoustory_workspace_ideas
for each row execute function private.touch_workspace_item_updated_at();
drop trigger if exists ghoustory_workspace_tasks_touch on public.ghoustory_workspace_tasks;
create trigger ghoustory_workspace_tasks_touch before update on public.ghoustory_workspace_tasks
for each row execute function private.touch_workspace_item_updated_at();

drop trigger if exists ghoustory_workspace_ideas_activity on public.ghoustory_workspace_ideas;
create trigger ghoustory_workspace_ideas_activity after insert or update on public.ghoustory_workspace_ideas
for each row execute function private.log_workspace_item_activity();
drop trigger if exists ghoustory_workspace_tasks_activity on public.ghoustory_workspace_tasks;
create trigger ghoustory_workspace_tasks_activity after insert or update on public.ghoustory_workspace_tasks
for each row execute function private.log_workspace_item_activity();

revoke all on function private.touch_workspace_item_updated_at() from public, anon, authenticated;
revoke all on function private.log_workspace_item_activity() from public, anon, authenticated;

grant select, insert, update, delete on public.ghoustory_workspace_ideas to authenticated;
grant select, insert, update, delete on public.ghoustory_workspace_tasks to authenticated;
grant select on public.ghoustory_workspace_activity to authenticated;
grant select on public.ghoustory_ai_usage to authenticated;
grant all on public.ghoustory_workspace_ideas, public.ghoustory_workspace_tasks, public.ghoustory_workspace_activity, public.ghoustory_ai_usage to service_role;
grant usage, select on all sequences in schema public to service_role;
