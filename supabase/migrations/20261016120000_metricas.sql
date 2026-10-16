-- Corte dashboard, fase A: metricas del tablero de /admin calculadas en la base sobre registro_descarga.
-- `metricas_registros` es la unica fuente del periodo (valida, filtra y agrega `dia`); las seis RPC leen de ahi.
-- Todas son SECURITY INVOKER: la RLS de registro_descarga ya es solo admin y el chequeo explicito da un error claro
-- (42501) en lugar de ceros silenciosos. Solo devuelven conteos; los porcentajes y la cobertura se calculan en el cliente.
-- "Fecha local" = America/Argentina/Buenos_Aires (UTC-3, sin horario de verano).

create index registro_descarga_fecha_hora_idx on public.registro_descarga (fecha_hora);

-- metricas_registros ---------------------------------------------------------------
-- 42501 si no es admin (se evalua primero); 22023 si el periodo es nulo, invertido, anterior a 2020-01-01 o posterior a hoy
-- (hoy = fecha local). El filtro es sargable: compara fecha_hora contra limites calculados una sola vez. Sin cargo_otro
-- (texto libre que el tablero no muestra).
create function public.metricas_registros(p_desde date, p_hasta date)
returns table (
  id bigint,
  taller_id int,
  cargo varchar,
  localidad_id smallint,
  institucion_tipo public.tipo_institucion,
  establecimiento_id int,
  institucion_otra varchar,
  fecha_hora timestamptz,
  dia date
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not (select public.es_admin()) then
    raise exception 'Solo el administrador puede consultar las metricas' using errcode = '42501';
  end if;

  if p_desde is null or p_hasta is null
     or p_desde > p_hasta
     or p_desde < date '2020-01-01'
     or p_hasta > (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'Periodo invalido: % a %', p_desde, p_hasta using errcode = '22023';
  end if;

  return query
    select r.id, r.taller_id, r.cargo, r.localidad_id, r.institucion_tipo, r.establecimiento_id, r.institucion_otra,
           r.fecha_hora, (r.fecha_hora at time zone 'America/Argentina/Buenos_Aires')::date
      from public.registro_descarga r
     where r.fecha_hora >= p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires'
       and r.fecha_hora < (p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires';
end;
$$;

-- Las cinco RPC siguientes son plpgsql y validan primero llamando a metricas_registros (`perform`): una consulta SQL pura
-- evalua el CTE de forma perezosa, y con un periodo invalido (que deja vacio el generate_series) o sin talleres la funcion
-- auxiliar nunca correria y no se propagarian el 42501 ni el 22023. El costo es una pasada extra por los registros del periodo.

-- metricas_resumen --------------------------------------------------------------------
-- descargas y establecimientos_alcanzados llevan periodo; talleres_publicados y sin_vincular son estado actual. sin_vincular
-- cuenta pares distintos (localidad, nombre normalizado) de instituciones OTRA sin establecimiento.
create function public.metricas_resumen(p_desde date, p_hasta date)
returns table (
  descargas bigint,
  establecimientos_alcanzados bigint,
  talleres_publicados bigint,
  sin_vincular bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.metricas_registros(p_desde, p_hasta) limit 1;

  return query
    with r as (select * from public.metricas_registros(p_desde, p_hasta))
    select
      (select count(*) from r),
      (select count(distinct r.establecimiento_id) from r),
      (select count(*) from public.taller t where t.estado = 'PUBLICADO'),
      (select count(*) from (
         select distinct d.localidad_id, lower(public.inmutable_unaccent(btrim(d.institucion_otra)))
           from public.registro_descarga d
          where d.institucion_tipo = 'OTRA' and d.establecimiento_id is null
       ) s);
end;
$$;

-- metricas_por_periodo --------------------------------------------------------------------
-- Una fila por dia (o por mes) del rango, con 0 donde no hubo descargas. El mes se trunca sobre la fecha local.
create function public.metricas_por_periodo(p_desde date, p_hasta date, p_por_mes boolean)
returns table (inicio date, descargas bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.metricas_registros(p_desde, p_hasta) limit 1;

  return query
    with r as (select * from public.metricas_registros(p_desde, p_hasta)),
    g as (
      select s::date as inicio
        from generate_series(
               case when p_por_mes then date_trunc('month', p_desde::timestamp) else p_desde::timestamp end,
               p_hasta::timestamp,
               case when p_por_mes then interval '1 month' else interval '1 day' end
             ) as s
    )
    select g.inicio, count(r.id)
      from g
      left join r
        on g.inicio = case when p_por_mes then date_trunc('month', r.dia::timestamp)::date else r.dia end
     group by g.inicio
     order by g.inicio;
end;
$$;

-- metricas_por_taller ---------------------------------------------------------------------
-- Solo talleres con descargas en el periodo, de cualquier estado actual. Sin orden garantizado.
create function public.metricas_por_taller(p_desde date, p_hasta date)
returns table (taller_id int, titulo varchar, estado public.estado_taller, descargas bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.metricas_registros(p_desde, p_hasta) limit 1;

  return query
    with r as (select * from public.metricas_registros(p_desde, p_hasta))
    select t.id, t.nombre, t.estado, count(*)
      from r
      join public.taller t on t.id = r.taller_id
     group by t.id, t.nombre, t.estado;
end;
$$;

-- metricas_por_nivel ------------------------------------------------------------------------
-- Los cinco niveles, tambien en 0, por la categoria actual del taller.
create function public.metricas_por_nivel(p_desde date, p_hasta date)
returns table (nivel_id smallint, nombre varchar, descargas bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.metricas_registros(p_desde, p_hasta) limit 1;

  return query
    with r as (select * from public.metricas_registros(p_desde, p_hasta)),
    c as (
      select ca.nivel_id, count(*) as n
        from r
        join public.taller t on t.id = r.taller_id
        join public.categoria ca on ca.id = t.categoria_id
       group by ca.nivel_id
    )
    select n.id, n.nombre, coalesce(c.n, 0)
      from public.nivel_educativo n
      left join c on c.nivel_id = n.id
     order by n.orden;
end;
$$;

-- metricas_por_cargo ---------------------------------------------------------------------------
-- Solo cargos con descargas; "Otro" agrupado, sin detallar cargo_otro.
create function public.metricas_por_cargo(p_desde date, p_hasta date)
returns table (cargo varchar, descargas bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.metricas_registros(p_desde, p_hasta) limit 1;

  return query
    with r as (select * from public.metricas_registros(p_desde, p_hasta))
    select r.cargo, count(*)
      from r
     group by r.cargo;
end;
$$;

-- metricas_por_localidad ---------------------------------------------------------------------------
-- Las 79 localidades. descargas: por la localidad declarada en el registro. alcanzados: establecimientos distintos y ACTIVOS
-- del periodo, atribuidos por establecimiento.localidad_id y de cualquier tipo (una OTRA vinculada cuenta). padron:
-- establecimientos activos de la localidad.
create function public.metricas_por_localidad(p_desde date, p_hasta date)
returns table (localidad_id smallint, nombre varchar, descargas bigint, alcanzados bigint, padron bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.metricas_registros(p_desde, p_hasta) limit 1;

  return query
    with r as (select * from public.metricas_registros(p_desde, p_hasta)),
    d as (
      select r.localidad_id, count(*) as n from r group by r.localidad_id
    ),
    a as (
      select e.localidad_id, count(*) as n
        from public.establecimiento e
       where e.activo and e.id in (select r.establecimiento_id from r where r.establecimiento_id is not null)
       group by e.localidad_id
    ),
    p as (
      select e.localidad_id, count(*) as n from public.establecimiento e where e.activo group by e.localidad_id
    )
    select l.id, l.nombre, coalesce(d.n, 0), coalesce(a.n, 0), coalesce(p.n, 0)
      from public.localidad l
      left join d on d.localidad_id = l.id
      left join a on a.localidad_id = l.id
      left join p on p.localidad_id = l.id
     order by l.id;
end;
$$;

-- Privilegios: Postgres da EXECUTE a PUBLIC y Supabase lo agrega a anon; se cierra a mano y se abre solo a authenticated.
revoke execute on function public.metricas_registros(date, date) from public, anon;
revoke execute on function public.metricas_resumen(date, date) from public, anon;
revoke execute on function public.metricas_por_periodo(date, date, boolean) from public, anon;
revoke execute on function public.metricas_por_taller(date, date) from public, anon;
revoke execute on function public.metricas_por_nivel(date, date) from public, anon;
revoke execute on function public.metricas_por_cargo(date, date) from public, anon;
revoke execute on function public.metricas_por_localidad(date, date) from public, anon;

grant execute on function public.metricas_registros(date, date) to authenticated;
grant execute on function public.metricas_resumen(date, date) to authenticated;
grant execute on function public.metricas_por_periodo(date, date, boolean) to authenticated;
grant execute on function public.metricas_por_taller(date, date) to authenticated;
grant execute on function public.metricas_por_nivel(date, date) to authenticated;
grant execute on function public.metricas_por_cargo(date, date) to authenticated;
grant execute on function public.metricas_por_localidad(date, date) to authenticated;
