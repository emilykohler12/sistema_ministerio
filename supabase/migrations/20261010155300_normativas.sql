-- Corte normativas (ADR 0007, 0012, 0016): normativas con sus etiquetas, el contador de descargas y el bucket publico
-- 'normativas'. Las etiquetas son las mismas de los talleres (resolver_etiquetas). Sin taller_normativa (C-02).

-- normativa ------------------------------------------------------------------
-- Baja fisica (definicion §8.4): el archivo tambien se borra de Storage, desde la app.
-- ruta_archivo es '<uuid>.pdf' en el bucket publico 'normativas': el id no existe cuando se sube el archivo (0016),
-- asi que la ruta no lo lleva. El CHECK fija ese formato (sin carpetas, sin mayusculas, solo pdf).
-- descargas la sube solo contar_descarga_normativa(); la edicion nunca la toca (grant de UPDATE por columna, mas abajo).
create table public.normativa (
  id int generated always as identity primary key,
  titulo varchar(200) not null check (btrim(titulo) <> ''),
  descripcion text,
  numero varchar(50) not null check (btrim(numero) <> ''),
  anio smallint not null check (anio between 1900 and 2100),
  ruta_archivo varchar(500) not null unique check (ruta_archivo ~ '^[0-9a-f-]{36}\.pdf$'),
  descargas int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un mismo numero y anio no se repite, sin distinguir mayusculas, tildes ni espacios en los extremos.
-- guardar_normativa guarda el numero recortado; el indice compara igual con btrim.
create unique index normativa_numero_anio_uniq
  on public.normativa (lower(public.inmutable_unaccent(btrim(numero))), anio);

-- RLS: lectura publica, escritura solo del admin.
alter table public.normativa enable row level security;

create policy normativa_select_publico
  on public.normativa
  for select
  to anon, authenticated
  using (true);

create policy normativa_insert_admin
  on public.normativa
  for insert
  to authenticated
  with check ((select public.es_admin()));

create policy normativa_update_admin
  on public.normativa
  for update
  to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

create policy normativa_delete_admin
  on public.normativa
  for delete
  to authenticated
  using ((select public.es_admin()));

-- descargas queda cerrada: ni el admin la cambia por la API, solo la RPC del contador (security definer; un rol con
-- bypass como postgres o service_role tambien podria, y por eso el WHEN de los triggers lo contempla).
-- Se revoca el UPDATE de tabla y se da por columna solo lo editable. Un UPDATE de descargas da 42501.
-- El grant por columna tambien habilita el FOR UPDATE de guardar_normativa.
revoke update on public.normativa from anon, authenticated;
grant update (titulo, descripcion, numero, anio, ruta_archivo) on public.normativa to authenticated;

-- normativa_etiqueta -----------------------------------------------------------
-- Igual que taller_etiqueta: PK compuesta (el indice de etiqueta_id cubre la FK), select publico (las normativas son
-- publicas, sin estado), insert y delete solo del admin, sin update (la PK es toda la fila). En la auditoria
-- registro_id queda nulo (no hay columna "id"); el JSON trae normativa_id.
-- La etiqueta no se borra con la normativa (la FK de etiqueta_id no tiene cascada y etiqueta no tiene delete).
create table public.normativa_etiqueta (
  normativa_id int not null references public.normativa (id) on delete cascade,
  etiqueta_id int not null references public.etiqueta (id),
  primary key (normativa_id, etiqueta_id)
);

create index normativa_etiqueta_etiqueta_id_idx
  on public.normativa_etiqueta (etiqueta_id);

alter table public.normativa_etiqueta enable row level security;

create policy normativa_etiqueta_select_publico
  on public.normativa_etiqueta
  for select
  to anon, authenticated
  using (true);

create policy normativa_etiqueta_insert_admin
  on public.normativa_etiqueta
  for insert
  to authenticated
  with check ((select public.es_admin()));

create policy normativa_etiqueta_delete_admin
  on public.normativa_etiqueta
  for delete
  to authenticated
  using ((select public.es_admin()));

-- Triggers ---------------------------------------------------------------------
-- Postgres no admite un WHEN que mencione OLD en un trigger de INSERT: por eso la auditoria de normativa son dos
-- triggers. Los de update se omiten solo cuando lo UNICO que cambia es el contador (descargas, mas updated_at, que la
-- tocaria el propio trigger): ese UPDATE no se audita ni mueve updated_at. Cualquier otro UPDATE, tambien el que no
-- cambia nada, se audita y mueve updated_at como en taller. Desde la API descargas solo la cambia la RPC (grant por
-- columna); la condicion ademas cubre a un rol con bypass (postgres, service_role) que cambie descargas y otra columna
-- a la vez: ese UPDATE si se audita (definicion §9: la auditoria no depende de desde donde llegue el cambio).
create trigger normativa_auditar_alta_baja
  after insert or delete on public.normativa
  for each row execute function public.auditar();

create trigger normativa_auditar_edicion
  after update on public.normativa
  for each row
  when (
    old.descargas = new.descargas
    or (to_jsonb(old) - 'descargas' - 'updated_at') is distinct from (to_jsonb(new) - 'descargas' - 'updated_at')
  )
  execute function public.auditar();

create trigger normativa_tocar_updated_at
  before update on public.normativa
  for each row
  when (
    old.descargas = new.descargas
    or (to_jsonb(old) - 'descargas' - 'updated_at') is distinct from (to_jsonb(new) - 'descargas' - 'updated_at')
  )
  execute function public.tocar_updated_at();

create trigger normativa_etiqueta_auditar
  after insert or update or delete on public.normativa_etiqueta
  for each row execute function public.auditar();

-- guardar_normativa ------------------------------------------------------------
-- Alta o edicion de una normativa con sus etiquetas, en una sola transaccion (la de la llamada).
-- SECURITY INVOKER: la RLS y los grants siguen valiendo, sin chequeo de rol propio (un usuario sin la marca recibe
-- 42501 en el insert del alta; en la edicion no ve la fila y recibe P0002, igual que guardar_taller).
-- p_id nulo = alta; un id que no existe en la edicion da P0002.
-- p_ruta_archivo nulo = conservar el archivo de la fila (en un alta es 23502). Asi un formulario con la cache vieja no
-- devuelve la fila a una ruta que otro admin ya reemplazo y borro.
-- Devuelve el id y la ruta que HAY QUE BORRAR del bucket: la que tenia la fila antes del guardado, leida con FOR UPDATE,
-- solo si este guardado la reemplazo (p_ruta_archivo no nulo y distinto de la anterior). Si se conserva el archivo o es
-- un alta, ruta_anterior es null y el cliente no borra nada (borrar la vigente dejaria la fila apuntando a la nada, 0016).
-- El FOR UPDATE serializa dos reemplazos simultaneos: cada uno recibe la ruta que reemplazo.
-- Los parametros opcionales van al final con default null (db:types solo marca opcionales los que tienen default).
-- Las columnas del RETURNS TABLE son variables de plpgsql: las consultas califican con alias para no chocar con ellas.
create function public.guardar_normativa(
  p_titulo text,
  p_descripcion text,
  p_numero text,
  p_anio smallint,
  p_etiquetas text[],
  p_ruta_archivo text default null,
  p_id int default null
)
returns table (id int, ruta_anterior text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id int;
  v_ruta_anterior text;
  v_ids int[];
begin
  -- 1. La normativa.
  if p_id is null then
    insert into public.normativa as n (titulo, descripcion, numero, anio, ruta_archivo)
    values (p_titulo, p_descripcion, btrim(p_numero), p_anio, p_ruta_archivo)
    returning n.id into v_id;
  else
    select n.ruta_archivo::text
      into v_ruta_anterior
      from public.normativa n
     where n.id = p_id
       for update;

    if not found then
      raise exception 'La normativa % no existe', p_id using errcode = 'P0002';
    end if;

    -- Se conserva el archivo (sin ruta nueva, o la misma): no hay nada que borrar.
    if p_ruta_archivo is null or p_ruta_archivo = v_ruta_anterior then
      v_ruta_anterior := null;
    end if;

    update public.normativa as n
       set titulo = p_titulo,
           descripcion = p_descripcion,
           numero = btrim(p_numero),
           anio = p_anio,
           ruta_archivo = coalesce(p_ruta_archivo, n.ruta_archivo)
     where n.id = p_id
    returning n.id into v_id;
  end if;

  -- 2. Etiquetas: las mismas que usan los talleres.
  v_ids := public.resolver_etiquetas(p_etiquetas);

  -- 3. Sincronizar el puente por diferencia (borra las quitadas, inserta las nuevas), para no inflar la auditoria.
  delete from public.normativa_etiqueta ne
   where ne.normativa_id = v_id
     and ne.etiqueta_id <> all (v_ids);

  insert into public.normativa_etiqueta (normativa_id, etiqueta_id)
  select v_id, x
    from unnest(v_ids) as x
  on conflict do nothing;

  id := v_id;
  ruta_anterior := v_ruta_anterior;
  return next;
end;
$$;

-- Postgres da EXECUTE a PUBLIC y Supabase lo agrega a anon por privilegios por defecto: se cierra a mano.
revoke execute on function public.guardar_normativa(text, text, text, smallint, text[], text, int)
  from public, anon;
grant execute on function public.guardar_normativa(text, text, text, smallint, text[], text, int)
  to authenticated;

-- contar_descarga_normativa ------------------------------------------------------
-- La llama el navegador de cualquier visitante al abrir el PDF (sin login). SECURITY DEFINER: anon no tiene UPDATE
-- sobre la tabla; corre como el dueno (postgres, bypassrls). Es el unico camino para cambiar descargas.
-- El UPDATE no dispara los triggers de auditoria ni de updated_at (su WHEN excluye el cambio de descargas): una descarga
-- anonima no deja filas en registro_operacion. Con un id inexistente no hace nada.
-- search_path vacio y nombres calificados. Anti-abuso del contador: fuera de alcance (solo sessionStorage en el cliente).
create function public.contar_descarga_normativa(p_id int)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.normativa
     set descargas = descargas + 1
   where id = p_id;
$$;

revoke execute on function public.contar_descarga_normativa(int) from public;
grant execute on function public.contar_descarga_normativa(int) to anon, authenticated;

-- Bucket 'normativas' ------------------------------------------------------------
-- Por migracion y no por config.toml (existe igual en local y en la nube). Publico: cualquiera abre el PDF por su
-- URL publica (getPublicUrl, definicion §9.3), sin pasar por RLS. El bucket es la autoridad de formato y tamano
-- (20 MiB, solo PDF): rechaza con 413 o 415 aunque el cliente no lo valide.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('normativas', 'normativas', true, 20971520, array['application/pdf']);

-- Politicas de storage.objects para el bucket -------------------------------------
-- La lectura publica del bucket no necesita politica. Solo el admin sube, lista y borra: select tambien lo necesita
-- remove(). Sin update: cada subida usa una ruta nueva (<uuid>.pdf), nunca upsert; el reemplazo sube un objeto nuevo y
-- borra el anterior. Sin politicas para anon: no escribe ni lista por la API de tablas.
create policy normativas_objetos_select_admin
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'normativas' and (select public.es_admin()));

create policy normativas_objetos_insert_admin
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'normativas' and (select public.es_admin()));

create policy normativas_objetos_delete_admin
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'normativas' and (select public.es_admin()));
