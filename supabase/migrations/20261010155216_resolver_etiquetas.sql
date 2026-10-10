-- Corte normativas, refactor previo (spec normativas, Fase A): el bloque de etiquetas de guardar_taller pasa a una
-- funcion propia para que guardar_normativa lo comparta. Las etiquetas son una sola tabla para talleres y normativas.

-- resolver_etiquetas -------------------------------------------------------------
-- Normaliza los nombres (btrim, minusculas, sin tildes), ignora vacios y duplicados, crea las etiquetas que faltan y
-- devuelve sus ids. El orden de los ids no esta garantizado.
-- SECURITY INVOKER: crear una etiqueta nueva pasa por la RLS de etiqueta (solo el admin); un usuario sin la marca
-- recibe 42501 en el insert. Sin chequeo de rol propio.
-- EXECUTE para authenticated (no para anon ni public): Postgres chequea EXECUTE tambien en las llamadas anidadas, con
-- el rol actual, asi que revocarla tambien a authenticated rompe guardar_taller y guardar_normativa. Exponerla en /rpc
-- no abre nada: hace lo mismo que un insert directo en etiqueta, que la RLS ya limita al admin.
create function public.resolver_etiquetas(p_etiquetas text[])
returns int[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_nombres text[];
  v_claves text[];
  v_ids int[];
begin
  -- (a) Normalizar una sola vez, sin duplicados: una fila por clave, con el primer valor recortado.
  select coalesce(array_agg(n.nombre order by n.ord), '{}'),
         coalesce(array_agg(n.clave order by n.ord), '{}')
    into v_nombres, v_claves
    from (
      select distinct on (k.clave) btrim(e.n) as nombre, k.clave, e.ord
        from unnest(p_etiquetas) with ordinality as e(n, ord)
        cross join lateral (
          select lower(public.inmutable_unaccent(btrim(e.n))) as clave
        ) k
       where btrim(e.n) <> ''
       order by k.clave, e.ord
    ) n;

  -- (b) Crear las que faltan. Sin target: alcanza con el indice unico normalizado, y una carrera con otro
  -- guardado de la misma etiqueta la saltea tras esperar su commit.
  insert into public.etiqueta (nombre)
  select unnest(v_nombres)
  on conflict do nothing;

  -- (c) Buscar los ids en otra sentencia (snapshot nuevo, ve las filas recien insertadas o confirmadas por otro).
  -- Si falta alguno es un error, no una etiqueta perdida en silencio.
  select coalesce(array_agg(e.id), '{}')
    into v_ids
    from public.etiqueta e
   where lower(public.inmutable_unaccent(btrim(e.nombre))) = any (v_claves);

  if cardinality(v_ids) <> cardinality(v_claves) then
    raise exception 'No se pudieron resolver todas las etiquetas';
  end if;

  return v_ids;
end;
$$;

-- Postgres da EXECUTE a PUBLIC y Supabase lo agrega a anon por privilegios por defecto: se cierra a mano.
revoke execute on function public.resolver_etiquetas(text[]) from public, anon;
grant execute on function public.resolver_etiquetas(text[]) to authenticated;

-- guardar_taller -----------------------------------------------------------------
-- Misma firma y mismos grants (create or replace los conserva); el bloque de etiquetas llama a resolver_etiquetas.
create or replace function public.guardar_taller(
  p_categoria_id int,
  p_nombre text,
  p_descripcion text,
  p_estado public.estado_taller,
  p_destinatarios smallint[],
  p_etiquetas text[],
  p_id int default null
)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id int;
  v_ids int[];
begin
  -- 1. El taller.
  if p_id is null then
    insert into public.taller (categoria_id, nombre, descripcion, estado)
    values (p_categoria_id, p_nombre, p_descripcion, p_estado)
    returning id into v_id;
  else
    update public.taller
       set categoria_id = p_categoria_id,
           nombre = p_nombre,
           descripcion = p_descripcion,
           estado = p_estado
     where id = p_id
    returning id into v_id;

    if not found then
      raise exception 'El taller % no existe', p_id using errcode = 'P0002';
    end if;
  end if;

  -- 2. Etiquetas.
  v_ids := public.resolver_etiquetas(p_etiquetas);

  -- 3. Sincronizar los puentes por diferencia (borra las quitadas, inserta las nuevas), para no inflar la auditoria.
  delete from public.taller_destinatario
   where taller_id = v_id
     and destinatario_id <> all (coalesce(p_destinatarios, '{}'));

  insert into public.taller_destinatario (taller_id, destinatario_id)
  select v_id, d
    from unnest(coalesce(p_destinatarios, '{}')) as d
  on conflict do nothing;

  delete from public.taller_etiqueta
   where taller_id = v_id
     and etiqueta_id <> all (v_ids);

  insert into public.taller_etiqueta (taller_id, etiqueta_id)
  select v_id, x
    from unnest(v_ids) as x
  on conflict do nothing;

  return v_id;
end;
$$;
