-- Corte recursos (ADR 0007, 0009, 0012, 0015): recursos de los talleres (archivos y enlaces) y el bucket privado 'talleres'.
-- Sin descarga publica: la Edge Function descargar-taller y el registro de descargas son el corte siguiente.

-- tipo_recurso -------------------------------------------------------------
-- Enum y no varchar+CHECK (0015): lista cerrada que el frontend usa como tipo; db:types genera la union.
-- Desvio de §8.3, anotado ahi.
create type public.tipo_recurso as enum ('PDF', 'PPTX', 'DOCX', 'IMAGEN', 'VIDEO', 'ENLACE');

-- recurso ------------------------------------------------------------------
-- Un recurso es un archivo (ruta_archivo en el bucket 'talleres') o un enlace (url), nunca ambos.
-- La FK a taller NO tiene on delete cascade: una cascada borraria filas dejando los archivos huerfanos en Storage,
-- y el taller no se borra (su baja es pasar a INACTIVO). Si algun dia se borra un taller, hay que borrar antes sus
-- recursos desde la app, que es quien sabe limpiar Storage.
create table public.recurso (
  id int generated always as identity primary key,
  taller_id int not null references public.taller (id),
  nombre varchar(200) not null check (btrim(nombre) <> ''),
  tipo public.tipo_recurso not null,
  ruta_archivo varchar(500) unique,
  url varchar(500),
  tamanio_bytes bigint,
  orden smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Archivo xor enlace: o es ENLACE con url (y sin ruta ni tamano), o es un archivo con ruta y tamano (y sin url).
  constraint recurso_archivo_xor_enlace check (
    (tipo = 'ENLACE' and url is not null and ruta_archivo is null and tamanio_bytes is null)
    or (tipo <> 'ENLACE' and url is null and ruta_archivo is not null and tamanio_bytes is not null)
  ),
  -- Solo https: un enlace http se bloquearia como contenido mixto y no se puede incrustar.
  constraint recurso_url_https check (url ~ '^https://'),
  -- El tope de 50 MiB vive solo en el bucket (file_size_limit): un unico lugar de SQL que lo hace cumplir.
  -- tamanio_bytes lo manda el cliente (file.size); la base no lo contrasta con storage.objects (un trigger que lea
  -- storage.objects corre antes que la RLS, no distingue "no existe" de "no lo veo" y acopla la base a storage-api).
  constraint recurso_tamanio_positivo check (tamanio_bytes > 0),
  -- El prefijo '<taller_id>/' impide que un recurso apunte al archivo de otro taller. Con el '/' incluido, el taller
  -- 5 no acepta '51/x.pdf'.
  constraint recurso_ruta_del_taller check (ruta_archivo like taller_id::text || '/%')
);

-- Cubre la FK y la lectura de los recursos de un taller.
create index recurso_taller_id_idx on public.recurso (taller_id);

-- RLS ------------------------------------------------------------------------
-- Select: la subconsulta pasa por la RLS de taller (molde de los puentes), asi la regla de visibilidad queda escrita una
-- sola vez y la baja del taller oculta sus recursos. Insert, update y delete: solo el admin.
alter table public.recurso enable row level security;

create policy recurso_select
  on public.recurso
  for select
  to anon, authenticated
  using (exists (select 1 from public.taller t where t.id = taller_id));

create policy recurso_insert_admin
  on public.recurso
  for insert
  to authenticated
  with check ((select public.es_admin()));

create policy recurso_update_admin
  on public.recurso
  for update
  to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

create policy recurso_delete_admin
  on public.recurso
  for delete
  to authenticated
  using ((select public.es_admin()));

-- taller_id queda cerrado: mover un recurso de taller dejaria su archivo bajo el prefijo de otro (lo prohibe el CHECK
-- de la ruta) y nadie lo necesita. Se revoca el UPDATE de tabla y se da por columna solo lo editable; tamanio_bytes,
-- ruta_archivo y tipo entran por el reemplazo de archivo. Un UPDATE de anon da 42501.
revoke update on public.recurso from anon, authenticated;
grant update (nombre, tipo, ruta_archivo, url, tamanio_bytes, orden) on public.recurso to authenticated;

-- Triggers -------------------------------------------------------------------
create trigger recurso_auditar
  after insert or update or delete on public.recurso
  for each row execute function public.auditar();

create trigger recurso_tocar_updated_at
  before update on public.recurso
  for each row execute function public.tocar_updated_at();

-- ordenar_recursos -----------------------------------------------------------
-- Guarda el orden de los recursos de un taller en una sola transaccion: p_ids es la lista completa, en el orden
-- nuevo, y la posicion (desde 1) pasa a ser recurso.orden. Pedir la lista completa renumera tambien los casos con
-- orden repetido (varias subidas en paralelo) y evita que dos pantallas pisen un orden parcial.
-- SECURITY INVOKER: la RLS y los grants siguen valiendo, sin chequeo de rol propio. Un usuario sin la marca no recibe
-- error sino un void, porque el update no encuentra filas que su politica le deje tocar.
-- Solo actualiza las filas cuyo orden cambia, para no inflar la auditoria.
create function public.ordenar_recursos(p_taller_id int, p_ids int[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actuales int[];
  v_pedidos int[];
begin
  select coalesce(array_agg(r.id order by r.id), '{}')
    into v_actuales
    from public.recurso r
   where r.taller_id = p_taller_id;

  -- Ordenadas para comparar como conjuntos; un id repetido o null hace que difieran.
  select coalesce(array_agg(x order by x), '{}')
    into v_pedidos
    from unnest(p_ids) as x;

  if v_pedidos is distinct from v_actuales then
    raise exception 'La lista de recursos no coincide con los del taller %', p_taller_id;
  end if;

  update public.recurso r
     set orden = o.pos::smallint
    from unnest(p_ids) with ordinality as o(id, pos)
   where r.id = o.id
     and r.orden is distinct from o.pos::smallint;
end;
$$;

-- Postgres da EXECUTE a PUBLIC y Supabase lo agrega a anon por privilegios por defecto: se cierra a mano.
revoke execute on function public.ordenar_recursos(int, int[]) from public, anon;
grant execute on function public.ordenar_recursos(int, int[]) to authenticated;

-- Bucket 'talleres' -----------------------------------------------------------
-- Por migracion y no por config.toml: asi existe igual en local y en la nube (config.toml solo aplica a local).
-- Privado: nadie lee un objeto por URL publica; el admin lo abre con un enlace firmado y la descarga de las escuelas
-- llegara con la Edge Function. El bucket es la autoridad de formato y tamano (50 MiB; PDF, PPTX, DOCX, JPG, PNG, WebP
-- y MP4): rechaza con 413 o 415 aunque el cliente no lo valide. Esta lista espeja MIME_POR_TIPO del frontend.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'talleres', 'talleres', false, 52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4'
  ]
);

-- Politicas de storage.objects para el bucket -------------------------------------
-- Solo el admin lee, sube y borra. Sin update: cada subida usa una ruta nueva (<taller_id>/<uuid>.<ext>), nunca upsert,
-- y el reemplazo sube un objeto nuevo y borra el anterior. Sin politicas para anon: no lee ningun objeto.
-- select tambien lo necesitan remove() y createSignedUrl().
create policy talleres_objetos_select_admin
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'talleres' and (select public.es_admin()));

create policy talleres_objetos_insert_admin
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'talleres' and (select public.es_admin()));

create policy talleres_objetos_delete_admin
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'talleres' and (select public.es_admin()));
