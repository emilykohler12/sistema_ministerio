-- Logo institucional (#23): bucket publico 'logo', sus politicas de storage.objects y el formato de
-- configuracion.logo_ruta. Sin funciones ni RPC: el cambio de logo es un UPDATE condicional del cliente
-- (.eq('logo_ruta', anterior)) sobre la politica de update que ya tiene configuracion (solo es_admin()).

-- Formato de la ruta ---------------------------------------------------------------
-- El cliente guarda siempre '<uuid>.<png|jpg|webp>' (nunca '.jpeg'). El CHECK es contrato con
-- src/features/configuracion/archivos.ts (rutaNueva) y con el bucket: sin carpetas, sin mayusculas, sin otras extensiones.
-- NULL = sin logo. Las filas existentes cumplen: hasta hoy logo_ruta es NULL.
alter table public.configuracion
  add constraint configuracion_logo_ruta_formato
  check (logo_ruta is null or logo_ruta ~ '^[0-9a-f-]{36}\.(png|jpg|webp)$');

-- Bucket 'logo' --------------------------------------------------------------------
-- Por migracion y no por config.toml (existe igual en local y en la nube). Publico: el portal lo muestra por su URL
-- publica (getPublicUrl, definicion §9.3) sin pasar por RLS. El bucket es la autoridad de formato y tamano
-- (2 MiB; PNG, JPEG y WebP, sin SVG): rechaza con 413 o 415 aunque el cliente no lo valide.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logo', 'logo', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']);

-- Politicas de storage.objects para el bucket -------------------------------------
-- La lectura publica del bucket no necesita politica. Solo el admin sube, lista y borra: select tambien lo necesita
-- remove(). Sin update: cada subida usa una ruta nueva (<uuid>.<ext>), nunca upsert; el cambio sube un objeto nuevo y
-- borra el anterior. Sin politicas para anon: no escribe ni lista por la API de tablas.
create policy logo_objetos_select_admin
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'logo' and (select public.es_admin()));

create policy logo_objetos_insert_admin
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'logo' and (select public.es_admin()));

create policy logo_objetos_delete_admin
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'logo' and (select public.es_admin()));
