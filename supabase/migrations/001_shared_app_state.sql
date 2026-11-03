-- Ghoustory Control Room: shared application state
-- Access model: every authenticated Supabase user can read and update the shared workspace.
-- Configure Google as the only enabled sign-in provider in Supabase Auth if Google-only login is required.

create table if not exists public.app_state (
    id text primary key check (id = 'ghoustory'),
    data jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users(id) on delete set null
);

alter table public.app_state enable row level security;

grant select, insert, update on public.app_state to authenticated;
revoke all on public.app_state from anon;

drop policy if exists "Authenticated users can read shared Ghoustory state" on public.app_state;
create policy "Authenticated users can read shared Ghoustory state"
    on public.app_state
    for select
    to authenticated
    using (true);

drop policy if exists "Authenticated users can create shared Ghoustory state" on public.app_state;
create policy "Authenticated users can create shared Ghoustory state"
    on public.app_state
    for insert
    to authenticated
    with check (id = 'ghoustory');

drop policy if exists "Authenticated users can update shared Ghoustory state" on public.app_state;
create policy "Authenticated users can update shared Ghoustory state"
    on public.app_state
    for update
    to authenticated
    using (id = 'ghoustory')
    with check (id = 'ghoustory');

create or replace function public.set_app_state_updated_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    new.updated_by := auth.uid();
    return new;
end;
$$;

drop trigger if exists set_app_state_updated_fields on public.app_state;
create trigger set_app_state_updated_fields
    before insert or update on public.app_state
    for each row
    execute function public.set_app_state_updated_fields();

insert into public.app_state (id, data)
values ('ghoustory', '{}'::jsonb)
on conflict (id) do nothing;
