-- Grexya — sync de documentos y miniaturas de boards.
-- kind 'doc': espejo de solo lectura de los markdown de la carpeta de proyectos.
-- cover: miniatura (data URL) del canvas de un board para el pool.

alter table public.notes drop constraint if exists notes_kind_check;
alter table public.notes
  add constraint notes_kind_check check (kind in ('note', 'board', 'doc'));

alter table public.notes add column if not exists cover text;
