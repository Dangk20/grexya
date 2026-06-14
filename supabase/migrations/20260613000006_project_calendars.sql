-- Grexya — conexión de Google Calendar por proyecto (cada proyecto, su cuenta)
create table public.project_calendars (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null unique references public.projects(id) on delete cascade,
  provider      text not null default 'google',
  email         text,                         -- cuenta conectada
  calendar_id   text not null default 'primary',
  access_token  text,
  refresh_token text,
  token_expiry  timestamptz,
  scope         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.project_calendars (project_id);

create trigger project_calendars_touch before update on public.project_calendars
  for each row execute function public.touch_updated_at();

-- RLS: vía workspace del proyecto (lectura de metadatos; los tokens se usan solo en servidor)
alter table public.project_calendars enable row level security;
create policy pc_rw on public.project_calendars for all
  using (exists (select 1 from public.projects p where p.id = project_id and is_workspace_member(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = project_id and is_workspace_member(p.workspace_id)));
