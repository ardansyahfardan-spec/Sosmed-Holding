-- Remove table-wide TRUNCATE capability from browser-facing roles.
-- This is intentionally a PR-only migration; do not apply to production before review.
revoke truncate on all tables in schema public from anon, authenticated;

comment on schema public is
  'Browser-facing roles must not receive table-wide TRUNCATE privileges; use row-scoped DML protected by RLS.';
