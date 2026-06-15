-- Grexya — integración con Notion por proyecto (Grexya → Notion, crear + actualizar).
-- Conexión vía Internal Integration Secret (token que no expira). La tabla es
-- genérica para poder migrar a OAuth más adelante sin cambiar el esquema.

create table if not exists public.project_notions (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null unique references public.projects(id) on delete cascade,
  access_token   text not null,                 -- internal integration secret (o token OAuth a futuro)
  database_id    text not null,                 -- DB de Notion destino
  database_title text,                           -- nombre de la DB (para mostrar)
  notion_user_id text,                           -- la persona "yo" en Notion (Responsable)
  mapping        jsonb not null default '{}'::jsonb, -- mapeo de propiedades y valores
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists project_notions_project_idx on public.project_notions (project_id);

create trigger project_notions_touch before update on public.project_notions
  for each row execute function public.touch_updated_at();

alter table public.project_notions enable row level security;
drop policy if exists pn_rw on public.project_notions;
create policy pn_rw on public.project_notions for all
  using (exists (select 1 from public.projects p where p.id = project_id and is_workspace_member(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = project_id and is_workspace_member(p.workspace_id)));

-- Vincula cada tarea con su página espejo en Notion (para actualizar la misma fila).
alter table public.tasks add column if not exists notion_page_id text;
