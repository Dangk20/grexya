-- Grexya — icono de proyecto: permitir subir imagen (además del emoji)
alter table public.projects add column if not exists icon_url text;
