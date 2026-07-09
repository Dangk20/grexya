-- Grexya — tareas recurrentes.
-- Al completar una tarea con `recurrence`, el servidor clona la tarea (y sus
-- subtareas, sin marcar) para la siguiente fecha de la serie.
-- `recurrence_from_id` apunta a la tarea que engendró el clon: sirve para no
-- duplicar la próxima ocurrencia y para deshacerla si se desmarca el completado.

alter table public.tasks
  add column if not exists recurrence text
    check (recurrence in ('daily', 'weekdays', 'weekly')),
  add column if not exists recurrence_from_id uuid
    references public.tasks(id) on delete set null;

-- Una tarea solo puede engendrar una próxima ocurrencia viva.
create unique index if not exists tasks_recurrence_from_uniq
  on public.tasks (recurrence_from_id)
  where recurrence_from_id is not null and deleted_at is null;

create index if not exists tasks_recurrence_idx
  on public.tasks (recurrence)
  where recurrence is not null;
