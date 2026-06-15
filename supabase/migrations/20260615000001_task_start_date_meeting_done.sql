-- Grexya — fecha de inicio de tareas + estado "hecha" de reuniones de Google
--
-- 1) start_date: define la ventana inicio→plazo del tablero "¿Qué haré hoy?".
--    Una tarea aparece en un día si éste cae entre start_date y due_date.
-- 2) meeting_completions: la API de Google Calendar es de solo lectura aquí, así
--    que guardamos localmente qué eventos ya se "tuvieron" (check).

-- 1) Fecha de inicio
alter table public.tasks add column if not exists start_date date;

-- 2) Reuniones de Google marcadas como hechas (por evento, por proyecto)
create table if not exists public.meeting_completions (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  event_id     text not null,                       -- id del evento de Google (instancia única)
  is_done      boolean not null default true,
  completed_at timestamptz not null default now(),
  unique (project_id, event_id)
);
create index on public.meeting_completions (project_id);

-- RLS: vía workspace del proyecto (igual que project_calendars)
alter table public.meeting_completions enable row level security;
drop policy if exists mc_rw on public.meeting_completions;
create policy mc_rw on public.meeting_completions for all
  using (exists (select 1 from public.projects p where p.id = project_id and is_workspace_member(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = project_id and is_workspace_member(p.workspace_id)));
