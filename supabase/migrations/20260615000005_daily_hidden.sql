-- Grexya — ítems ocultados del daily (no leerlos en el standup).
-- item_id puede ser un id de tarea o un id de evento de Google Calendar.

create table if not exists public.daily_hidden (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  item_id    text not null,
  created_at timestamptz not null default now(),
  unique (project_id, item_id)
);
create index if not exists daily_hidden_project_idx on public.daily_hidden (project_id);

alter table public.daily_hidden enable row level security;
drop policy if exists dh_rw on public.daily_hidden;
create policy dh_rw on public.daily_hidden for all
  using (exists (select 1 from public.projects p where p.id = project_id and is_workspace_member(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = project_id and is_workspace_member(p.workspace_id)));
