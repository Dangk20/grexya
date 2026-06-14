-- Grexya — tablero dinámico: el "estado" vuelve a ser una columna editable
-- (project_statuses). Reconecta cada tarea a su columna por posición.

update public.tasks t
set status_id = ps.id
from public.project_statuses ps
where ps.project_id = t.project_id
  and ps.position = case t.status
        when 'sin' then 0
        when 'prog' then 1
        when 'listo' then 2
        else 0 end
  and t.status_id is null;

-- el completado vive en is_done (independiente de la columna)
update public.tasks set is_done = (status = 'listo') where is_done is distinct from (status = 'listo');
