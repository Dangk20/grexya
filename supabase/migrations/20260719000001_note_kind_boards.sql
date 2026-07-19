-- Grexya — boards infinitos: las filas de notes ahora pueden ser hojas ('note')
-- o boards edgeless ('board'). Mismo formato de contenido (doc BlockSuite).

alter table public.notes
  add column if not exists kind text not null default 'note'
  check (kind in ('note', 'board'));

create index if not exists notes_kind_idx on public.notes (kind);
