-- Instituciones sin vincular (issue #19). Las descargas con institucion "Otra" (OTRA sin establecimiento_id) no suman a los
-- establecimientos alcanzados. Estas dos RPC listan los grupos y los vinculan a un establecimiento del padron, conservando
-- institucion_tipo = 'OTRA' e institucion_otra (0010).
-- Clave del grupo: (localidad_id, lower(inmutable_unaccent(btrim(institucion_otra)))), la misma de metricas_resumen.sin_vincular
-- y de establecimiento_localidad_nombre_uniq.

-- instituciones_sin_vincular -----------------------------------------------------------------
-- SECURITY INVOKER: solo lee y la RLS de registro_descarga ya exige al admin; el chequeo explicito da 42501 en lugar de una lista
-- vacia. Las formas escritas se ordenan una sola vez (mas frecuente, en empate la mas reciente): nombre = la primera y
-- variantes = el resto (una porcion fuera de rango da '{}', nunca NULL). Orden: descargas desc, ultima desc, localidad_id, nombre.
create function public.instituciones_sin_vincular()
returns table (
  localidad_id smallint,
  localidad varchar,
  nombre text,
  variantes text[],
  descargas bigint,
  ultima timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not (select public.es_admin()) then
    raise exception 'Solo el administrador puede consultar las instituciones sin vincular' using errcode = '42501';
  end if;

  return query
    with formas as (
      select d.localidad_id,
             lower(public.inmutable_unaccent(btrim(d.institucion_otra))) as clave,
             d.institucion_otra as forma,
             count(*) as n,
             max(d.fecha_hora) as ult
        from public.registro_descarga d
       where d.institucion_tipo = 'OTRA' and d.establecimiento_id is null
       group by d.localidad_id, lower(public.inmutable_unaccent(btrim(d.institucion_otra))), d.institucion_otra
    ),
    grupos as (
      select f.localidad_id,
             array_agg(f.forma::text order by f.n desc, f.ult desc, f.forma) as formas,
             sum(f.n)::bigint as descargas,
             max(f.ult) as ultima
        from formas f
       group by f.localidad_id, f.clave
    )
    select g.localidad_id, l.nombre, g.formas[1], g.formas[2:], g.descargas, g.ultima
      from grupos g
      join public.localidad l on l.id = g.localidad_id
     order by g.descargas desc, g.ultima desc, g.localidad_id, g.formas[1];
end;
$$;

-- vincular_institucion -----------------------------------------------------------------------
-- SECURITY DEFINER: registro_descarga no tiene grant de UPDATE ni politica (molde de 0017 y 0022), asi que esta es la unica forma de
-- escribir y solo toca establecimiento_id. es_admin() lee el JWT, que no cambia dentro de un definer. Si el establecimiento no existe,
-- esta inactivo o es de otra localidad: DA005. FOR SHARE impide que se dé de baja entre la validacion y el update. Devuelve la
-- cantidad de registros vinculados (0 si otro admin ya lo hizo o no hay grupo). El UPDATE queda en registro_operacion (auditar()).
create function public.vincular_institucion(p_localidad_id smallint, p_nombre text, p_establecimiento_id int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clave text;
  v_cantidad int;
begin
  if not (select public.es_admin()) then
    raise exception 'Solo el administrador puede vincular instituciones' using errcode = '42501';
  end if;

  perform 1
     from public.establecimiento e
    where e.id = p_establecimiento_id and e.activo and e.localidad_id = p_localidad_id
      for share;
  if not found then
    raise exception 'El establecimiento % no esta disponible en la localidad %', p_establecimiento_id, p_localidad_id
      using errcode = 'DA005';
  end if;

  v_clave := lower(public.inmutable_unaccent(btrim(p_nombre)));

  update public.registro_descarga d
     set establecimiento_id = p_establecimiento_id
   where d.institucion_tipo = 'OTRA'
     and d.establecimiento_id is null
     and d.localidad_id = p_localidad_id
     and lower(public.inmutable_unaccent(btrim(d.institucion_otra))) = v_clave;

  get diagnostics v_cantidad = row_count;
  return v_cantidad;
end;
$$;

revoke execute on function public.instituciones_sin_vincular() from public, anon, service_role;
revoke execute on function public.vincular_institucion(smallint, text, int) from public, anon, service_role;
grant execute on function public.instituciones_sin_vincular() to authenticated;
grant execute on function public.vincular_institucion(smallint, text, int) to authenticated;
