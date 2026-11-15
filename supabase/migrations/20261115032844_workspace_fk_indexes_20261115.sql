-- Cover the new Workspace foreign keys with indexes to keep deletes and user-scoped lookups efficient.
create index if not exists ghoustory_workspace_ideas_author_idx
  on public.ghoustory_workspace_ideas (created_by, created_at desc);
create index if not exists ghoustory_workspace_tasks_author_idx
  on public.ghoustory_workspace_tasks (created_by, status, created_at desc);
create index if not exists ghoustory_workspace_activity_actor_idx
  on public.ghoustory_workspace_activity (actor_id, created_at desc);
create index if not exists ghoustory_ai_usage_user_idx
  on public.ghoustory_ai_usage (user_id, created_at desc);
