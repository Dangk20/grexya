-- Grexya — Fase 1.5/2: notas por proyecto + chat IA (threads/mensajes)

-- ============================================================
-- NOTES (docs estilo Notion por proyecto)
-- ============================================================
create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title      text not null default 'Sin título',
  body       text not null default '',
  position   int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.notes (project_id);

create trigger notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();

-- ============================================================
-- AGENT THREADS / MESSAGES (chat IA por proyecto)
-- ============================================================
create table public.agent_threads (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  agent_key  text not null,                 -- forge | aura | grexya | norte | hu-writer
  title      text not null default 'Nueva conversación',
  created_at timestamptz not null default now()
);
create index on public.agent_threads (project_id);

create table public.agent_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.agent_threads(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);
create index on public.agent_messages (thread_id);

-- ============================================================
-- RLS (mismo patrón: vía workspace del proyecto)
-- ============================================================
alter table public.notes          enable row level security;
alter table public.agent_threads  enable row level security;
alter table public.agent_messages enable row level security;

create policy notes_write on public.notes for all
  using (exists (select 1 from public.projects p where p.id = project_id and is_workspace_member(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = project_id and is_workspace_member(p.workspace_id)));

create policy threads_write on public.agent_threads for all
  using (exists (select 1 from public.projects p where p.id = project_id and is_workspace_member(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = project_id and is_workspace_member(p.workspace_id)));

create policy messages_write on public.agent_messages for all
  using (exists (
    select 1 from public.agent_threads t
    join public.projects p on p.id = t.project_id
    where t.id = thread_id and is_workspace_member(p.workspace_id)
  ))
  with check (exists (
    select 1 from public.agent_threads t
    join public.projects p on p.id = t.project_id
    where t.id = thread_id and is_workspace_member(p.workspace_id)
  ));
