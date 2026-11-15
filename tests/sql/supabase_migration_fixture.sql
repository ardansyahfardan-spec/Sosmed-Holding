-- Minimal Supabase-compatible PostgreSQL fixture for migration regression tests.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role supabase_admin nologin;

create schema auth;
create schema private;
create table auth.users (id uuid primary key);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.permission_probe (id integer primary key);
grant select, insert, update, delete, truncate on public.permission_probe to anon, authenticated;
