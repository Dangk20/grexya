-- Grexya — registro de "planning time" por proyecto y día.
-- Marca un día como planeado ('planned') o saltado a propósito ('skipped')
-- para que el modal de planeación no se vuelva a abrir ese día.

create table if not exists public.project_plannings (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  day_date   date not null,
  status     text not null default 'planned' check (status in ('planned', 'skipped')),
  created_at timestamptz not null default now(),
  unique (project_id, day_date)
);
create index if not exists project_plannings_project_idx on public.project_plannings (project_id);

alter table public.project_plannings enable row level security;
drop policy if exists pp_rw on public.project_plannings;
create policy pp_rw on public.project_plannings for all
  using (exists (select 1 from public.projects p where p.id = project_id and is_workspace_member(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = project_id and is_workspace_member(p.workspace_id)));
