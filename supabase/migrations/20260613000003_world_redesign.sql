-- Grexya — rediseño "mundos": campos de proyecto + estado simple de tarea

-- ===== projects: mundo (accent/cover/tagline/modules) =====
alter table public.projects add column if not exists accent  text;
alter table public.projects add column if not exists cover   text;
alter table public.projects add column if not exists tagline text;
alter table public.projects add column if not exists modules text[] not null default '{hoy,kanban,lista,notas}';

-- ===== tasks: estado simple (sin/prog/listo) + reuniones + top =====
alter table public.tasks add column if not exists status       text not null default 'sin'
  check (status in ('sin','prog','listo'));
alter table public.tasks add column if not exists meeting_time text;
alter table public.tasks add column if not exists top_rank     int;

-- backfill status desde is_done / nombre del estado anterior
update public.tasks t set status = case
  when t.is_done then 'listo'
  when ps.name ilike '%progreso%' then 'prog'
  else 'sin' end
from public.project_statuses ps where ps.id = t.status_id;
update public.tasks set status = 'listo' where is_done and status <> 'listo';
update public.tasks set status = 'sin'   where status_id is null and not is_done and status <> 'listo';

-- backfill accents / tagline / modules
with ranked as (
  select id, type, name,
    row_number() over (partition by workspace_id order by position, created_at) as rn
  from public.projects
)
update public.projects p set
  accent  = coalesce(p.accent,  (array['#5B5BD6','#7C66DC','#E93D82','#0E9888','#B45718','#3E63DD'])[((r.rn-1) % 6)+1]),
  tagline = coalesce(p.tagline, p.name),
  modules = case when p.type = 'diario'
                 then array['hoy','lista','notas']
                 else array['hoy','kanban','lista','notas'] end
from ranked r where r.id = p.id;

update public.projects set cover = coalesce(cover,
  'linear-gradient(120deg, ' || accent || ', color-mix(in oklab, ' || accent || ' 55%, #fff))')
where accent is not null;
