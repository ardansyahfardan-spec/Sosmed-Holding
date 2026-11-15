-- Remove table-wide TRUNCATE capability from browser-facing roles.
-- Also prevent it from being inherited by future public tables created by
-- either role used by Supabase migrations/administration.
-- PR-only: do not apply to production before review and non-production testing.
revoke truncate on all tables in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;

alter default privileges for role supabase_admin in schema public
  revoke truncate on tables from anon, authenticated;
