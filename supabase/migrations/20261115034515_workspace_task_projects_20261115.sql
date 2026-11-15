alter table public.ghoustory_workspace_tasks
  add column if not exists project_name text not null default 'Umum'
  check (char_length(project_name) between 1 and 80);

create index if not exists ghoustory_workspace_tasks_project_idx
  on public.ghoustory_workspace_tasks (project_name, status, created_at desc);
