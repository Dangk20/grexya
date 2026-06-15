-- Grexya — papelera (soft-delete) de tareas.
-- En vez de borrar la fila, se marca deleted_at; así se puede deshacer/restaurar.

alter table public.tasks add column if not exists deleted_at timestamptz;
create index if not exists tasks_deleted_at_idx on public.tasks (deleted_at);
