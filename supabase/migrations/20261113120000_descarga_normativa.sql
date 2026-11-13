-- Descargas de normativas por periodo (#32).
-- `normativa.descargas` sigue siendo el total historico; esta tabla guarda cuantas descargas hubo cada dia (fecha local de
-- Argentina) para poder mostrarlas por periodo. Un conteo por normativa y dia, no una fila por llamada: la base no crece con el
-- abuso de un endpoint anonimo. Las descargas anteriores a esta migracion no tienen dia y no entran en ningun periodo.

create table public.descarga_normativa_dia (
  normativa_id int not null references public.normativa (id) on delete cascade,
  dia date not null,
  descargas int not null check (descargas > 0),
  primary key (normativa_id, dia)
);

-- RLS: lee solo el admin. Nadie escribe por la API: la unica via es contar_descarga_normativa (security definer, mas abajo).
-- La PK (normativa_id, dia) tambien sirve a la cascada de la baja de una normativa.
alter table public.descarga_normativa_dia enable row level security;

revoke all on public.descarga_normativa_dia from anon, authenticated;
grant select on public.descarga_normativa_dia to authenticated;

create policy descarga_normativa_dia_select_admin
  on public.descarga_normativa_dia
  for select
  to authenticated
  using ((select public.es_admin()));

-- Sin auditar(): es el conteo de un hecho anonimo (0022) y la cascada de una baja escribiria una fila por dia en el historial;
-- la baja de la normativa ya queda auditada. Excepcion declarada en auditoria_global.test.sql.

-- contar_descarga_normativa: el update del contador y el upsert del dia van en una sola sentencia. El CTE de escritura se
-- ejecuta siempre; con sesion de admin (#25) o un id inexistente el update no devuelve filas y no se inserta nada.
-- create or replace conserva el dueno y los grants; se repiten security definer y search_path porque proconfig se reemplaza.
create or replace function public.contar_descarga_normativa(p_id int)
returns void
language sql
security definer
set search_path = ''
as $$
  with u as (
    update public.normativa
       set descargas = descargas + 1
     where id = p_id and not (select public.es_admin())
    returning id
  )
  insert into public.descarga_normativa_dia (normativa_id, dia, descargas)
  select id, (now() at time zone 'America/Argentina/Buenos_Aires')::date, 1 from u
  on conflict (normativa_id, dia)
  do update set descargas = public.descarga_normativa_dia.descargas + 1;
$$;

-- metricas_normativas: una fila por normativa, con el total historico y las descargas de los dias dentro de [desde, hasta]
-- (0 si no hay). Valida el periodo con `perform` sobre metricas_registros para heredar el 42501 y el 22023 (molde de 0024).
-- Solo conteos; el orden lo pone el cliente.
create function public.metricas_normativas(p_desde date, p_hasta date)
returns table (
  id int,
  titulo varchar,
  numero varchar,
  anio smallint,
  descargas int,
  descargas_periodo bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.metricas_registros(p_desde, p_hasta) limit 1;

  return query
    select n.id, n.titulo, n.numero, n.anio, n.descargas, coalesce(sum(d.descargas), 0)::bigint
      from public.normativa n
      left join public.descarga_normativa_dia d
        on d.normativa_id = n.id and d.dia between p_desde and p_hasta
     group by n.id, n.titulo, n.numero, n.anio, n.descargas;
end;
$$;

revoke execute on function public.metricas_normativas(date, date) from public, anon;
grant execute on function public.metricas_normativas(date, date) to authenticated;
