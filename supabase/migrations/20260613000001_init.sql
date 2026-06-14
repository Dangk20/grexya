-- Grexya — esquema inicial (Fase 1)
-- Identidad gestionada por Clerk. El user id de Clerk llega en auth.jwt()->>'sub'
-- gracias a la integración Third-Party Auth (Clerk) de Supabase.

-- ============================================================
-- Helpers
-- ============================================================
create or replace function public.clerk_user_id()
returns text language sql stable as $$
  select auth.jwt() ->> 'sub'
$$;

-- ============================================================
-- WORKSPACES (el portafolio de un builder)
-- ============================================================
create table public.workspaces (
  id           uuid primary key default gen_random_uuid(),
  owner_id     text not null,                 -- Clerk user id
  clerk_org_id text,                           -- Clerk Organization (equipo, futuro)
  name         text not null,
  slug         text not null,
  created_at   timestamptz not null default now(),
  unique (owner_id, slug)
);

create table public.workspace_members (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      text not null,                 -- Clerk user id
  role         text not null default 'member' check (role in ('owner','admin','member')),
  created_at   timestamptz not null default now(),
  unique (workspace_id, user_id)
);

-- ============================================================
-- PROJECTS
-- ============================================================
create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  name            text not null,
  slug            text not null,
  emoji           text default '📦',
  color           text,
  type            text not null default 'venture' check (type in ('venture','diario')),
  context         text,
  status          text not null default 'activo' check (status in ('activo','pausado','archivado')),
  stage           text default 'E0',
  time_target_pct int  check (time_target_pct between 0 and 100), -- % de dedicación objetivo
  active_days     text[],                                          -- ej. {lun,mar,mie,jue,vie}
  position        int  not null default 0,
  created_at      timestamptz not null default now(),
  unique (workspace_id, slug)
);

-- Columnas del tablero Kanban (estados), por proyecto
create table public.project_statuses (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null,
  color      text not null default 'gray',
  position   int  not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- TASKS (con subtareas + planificación diaria estilo Eisenhower)
-- ============================================================
create table public.tasks (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  parent_task_id uuid references public.tasks(id) on delete cascade,  -- subtareas
  title          text not null,
  description    text,
  status_id      uuid references public.project_statuses(id) on delete set null,
  assignee_id    text,                                                -- Clerk user id
  priority       text check (priority in ('alta','media','baja')),
  front          text check (front in ('business','tech','branding','marketing')),
  due_date       date,
  -- Planificación diaria (proyectos tipo 'diario')
  eisenhower     text check (eisenhower in ('ui','ni','un','nn','reunion')), -- urgente/importante…
  day_date       date,                                                -- la "hoja" del día
  is_top3        boolean not null default false,                      -- Top 3 del día
  is_done        boolean not null default false,
  completed_at   timestamptz,
  position       double precision not null default 0,                 -- orden dentro de la columna
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index on public.projects (workspace_id);
create index on public.project_statuses (project_id);
create index on public.tasks (project_id);
create index on public.tasks (status_id);
create index on public.tasks (parent_task_id);
create index on public.tasks (day_date);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- ¿el usuario actual pertenece a este workspace? (security definer evita recursión de RLS)
create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspaces w where w.id = ws and w.owner_id = clerk_user_id()
  ) or exists (
    select 1 from workspace_members m where m.workspace_id = ws and m.user_id = clerk_user_id()
  )
$$;

alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects          enable row level security;
alter table public.project_statuses  enable row level security;
alter table public.tasks             enable row level security;

-- workspaces
create policy ws_select on public.workspaces for select using (is_workspace_member(id));
create policy ws_insert on public.workspaces for insert with check (owner_id = clerk_user_id());
create policy ws_update on public.workspaces for update using (owner_id = clerk_user_id());
create policy ws_delete on public.workspaces for delete using (owner_id = clerk_user_id());

-- workspace_members (solo el dueño del workspace administra miembros)
create policy wm_select on public.workspace_members for select using (is_workspace_member(workspace_id));
create policy wm_write on public.workspace_members for all
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = clerk_user_id()))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = clerk_user_id()));

-- projects
create policy pr_select on public.projects for select using (is_workspace_member(workspace_id));
create policy pr_write  on public.projects for all
  using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));

-- project_statuses (via workspace del proyecto)
create policy ps_write on public.project_statuses for all
  using (exists (select 1 from public.projects p where p.id = project_id and is_workspace_member(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = project_id and is_workspace_member(p.workspace_id)));

-- tasks (via workspace del proyecto)
create policy tk_write on public.tasks for all
  using (exists (select 1 from public.projects p where p.id = project_id and is_workspace_member(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = project_id and is_workspace_member(p.workspace_id)));
