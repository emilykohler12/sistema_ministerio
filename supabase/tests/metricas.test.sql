-- Corte dashboard, fase A (criterios 2, 3, 4, 5, 6, 9 y 10 de docs/specs/dashboard/spec.md; critica.md puntos 1, 2, 4, 5, 7, 8, 12, 13):
-- indice por fecha_hora, la funcion auxiliar metricas_registros() y las seis RPC de agregacion. No depende del seed: todo el
-- soporte se crea dentro de la transaccion (rollback al final). Supone una base sin talleres, registros ni padron previos
-- (la que deja `npm run db:reset`; los tests de este repo no persisten datos).
--
-- CONTRATO (lo que debe cumplir la migracion; el test llama por nombre):
--
--   Todas las funciones: schema public, nombre `metricas_*`, SECURITY INVOKER, `set search_path = ''`, EXECUTE solo para
--   `authenticated` (ni public ni anon). Son exactamente 7. Las RPC devuelven solo conteos enteros (bigint), sin porcentajes.
--   "Fecha local" = fecha en America/Argentina/Buenos_Aires (UTC-3, sin horario de verano).
--
--   create index registro_descarga_fecha_hora_idx on public.registro_descarga (fecha_hora);
--
--   public.metricas_registros(p_desde date, p_hasta date)
--     returns table (id bigint, taller_id int, cargo varchar, localidad_id smallint, institucion_tipo tipo_institucion,
--                    establecimiento_id int, institucion_otra varchar, fecha_hora timestamptz, dia date)
--     Sin `cargo_otro` (texto libre que el tablero no muestra). `dia` = fecha local de fecha_hora.
--     Filtro (sargable): fecha_hora >= p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires'
--                    y   fecha_hora <  (p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'.
--     42501 si not es_admin(). 22023 si p_desde o p_hasta son nulos, p_desde > p_hasta, p_desde < '2020-01-01' o p_hasta > hoy
--     (hoy = fecha local actual). El 42501 se evalua primero.
--
--   public.metricas_resumen(p_desde date, p_hasta date)
--     -> UNA fila (descargas bigint, establecimientos_alcanzados bigint, talleres_publicados bigint, sin_vincular bigint)
--        descargas: registros del periodo. establecimientos_alcanzados: establecimiento_id distintos y no nulos del periodo (activos
--        o no, de cualquier tipo). talleres_publicados: estado actual, sin periodo. sin_vincular: pares distintos
--        (localidad_id, lower(inmutable_unaccent(btrim(institucion_otra)))) con tipo OTRA y establecimiento_id nulo, SIN periodo.
--        No cuenta normativas.
--
--   public.metricas_por_periodo(p_desde date, p_hasta date, p_por_mes boolean)
--     -> (inicio date, descargas bigint). Una fila por dia (o por mes si p_por_mes) del rango, con 0 donde no hubo descargas,
--        ordenadas por inicio. El mes se trunca sobre la fecha local (date_trunc('month', dia)::date), no sobre el timestamptz.
--        En modo mes, `inicio` es el primer dia del mes (el rango no se recorta: cuenta los meses que toca [desde, hasta]).
--
--   public.metricas_por_taller(p_desde date, p_hasta date)
--     -> (taller_id int, titulo varchar, estado estado_taller, descargas bigint). `titulo` = taller.nombre. Solo talleres con
--        descargas en el periodo, de cualquier estado actual. Sin orden garantizado (el cliente ordena).
--
--   public.metricas_por_nivel(p_desde date, p_hasta date)
--     -> (nivel_id smallint, nombre varchar, descargas bigint). Los 5 niveles, tambien en 0 (left join), por la categoria ACTUAL
--        del taller.
--
--   public.metricas_por_cargo(p_desde date, p_hasta date)
--     -> (cargo varchar, descargas bigint). Solo cargos con descargas; "Otro" agrupado sin detallar cargo_otro.
--
--   public.metricas_por_localidad(p_desde date, p_hasta date)
--     -> (localidad_id smallint, nombre varchar, descargas bigint, alcanzados bigint, padron bigint). Las 79 localidades.
--        descargas: por registro_descarga.localidad_id (la declarada). alcanzados: establecimiento_id distintos de los registros
--        del periodo cuyo establecimiento esta ACTIVO, atribuidos por establecimiento.localidad_id, sin filtrar el tipo
--        (una OTRA vinculada cuenta). padron: establecimientos activos de la localidad.
--
-- Notas de diseno del test:
-- - Todo el soporte de escritura va como postgres al principio (auditar() no deja escribir a postgres con claims puestos).
-- - Los tipos de las columnas se fijan con los casts de la comparacion; los nombres, con el select por nombre.
-- - Las pruebas de error recorren una lista de llamadas, una por funcion: con la lista de abajo ya cubierta por el recorrido de
--   pg_proc ("exactamente 7"), una octava funcion obliga a tocar el test.
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

-- Soporte del test (como postgres) ---------------------------------------------
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '88888888-8888-8888-8888-888888888888',
        'authenticated', 'authenticated', 'metricas-admin@test.local');

insert into public.categoria (nivel_id, nombre, descripcion, activo)
values (1, 'Cat M1', 'base', true), (2, 'Cat M2', 'base', true);

-- TP y TI (nivel 1) y TQ, TB y TP2 (nivel 2). TB y TP2 no tienen descargas.
insert into public.taller (categoria_id, nombre, descripcion, estado, created_at, updated_at)
select c.id, v.nombre, 'd', v.estado::public.estado_taller, '2020-01-01', '2020-01-01'
  from (values ('M TP', 'Cat M1', 'PUBLICADO'), ('M TI', 'Cat M1', 'INACTIVO'), ('M TQ', 'Cat M2', 'PUBLICADO'),
               ('M TB', 'Cat M2', 'BORRADOR'), ('M TP2', 'Cat M2', 'PUBLICADO')) as v(nombre, cat, estado)
  join public.categoria c on c.nombre = v.cat;

-- E_A (loc 1, activo), E_B (loc 1, inactivo), E_C (loc 2, activo), E_D (loc 1, activo; se vincula desde una OTRA declarada en loc 2)
insert into public.establecimiento (cue, nombre, localidad_id, activo)
values ('9101', 'Met A', 1, true), ('9102', 'Met B inactivo', 1, false), ('9103', 'Met C', 2, true), ('9104', 'Met D', 1, true);

-- Registros fijos. Horas en Argentina (-03). Periodo base: 2026-03-10 a 2026-03-12.
--   r1 borde desde (00:00)            TP Docente      loc1 PADRON  E_A
--   r2 borde hasta (23:59)            TP Docente      loc1 PADRON  E_A      (02:59 UTC del 13)
--   r3                                TI Director/a   loc1 PADRON  E_B (inactivo)
--   r4                                TQ Otro         loc2 OTRA    E_D (vinculada; el padron la ubica en loc1)
--   r5                                TQ Otro         loc2 OTRA    sin id, 'Escuela Nueva'
--   r6                                TQ Docente      loc2 OTRA    sin id, 'ESCUÉLA NUEVA' (misma clave que r5)
--   r7                                TQ Docente      loc3 OTRA    sin id, 'Escuela Nueva' (otra localidad: otro par)
--   r10                               TP Supervisor/a loc3 SIN_INSTITUCION
--   fuera: r8 23:59 del 9 (loc2, PADRON E_C), r9 00:00 del 13, r11 febrero (OTRA sin id, loc4, 'Fuera de periodo'),
--          r12 31/03 22:00 (01:00 UTC del 1/04), usado para el truncado del mes.
insert into public.registro_descarga (taller_id, cargo, cargo_otro, localidad_id, institucion_tipo, establecimiento_id,
                                      institucion_otra, fecha_hora)
select t.id, v.cargo, v.cargo_otro, v.loc, v.tipo::public.tipo_institucion, e.id, v.otra, v.fh::timestamptz
  from (values
    ('M TP', 'Docente',      null::text,     1, 'PADRON',          '9101', null::text,         '2026-03-10 00:00:00-03'),
    ('M TP', 'Docente',      null,           1, 'PADRON',          '9101', null,               '2026-03-12 23:59:00-03'),
    ('M TI', 'Director/a',   null,           1, 'PADRON',          '9102', null,               '2026-03-11 10:00:00-03'),
    ('M TQ', 'Otro',         'Bibliotecaria', 2, 'OTRA',           '9104', 'Escuela Vinc',     '2026-03-11 12:00:00-03'),
    ('M TQ', 'Otro',         'Pasante',      2, 'OTRA',            null,   'Escuela Nueva',    '2026-03-11 13:00:00-03'),
    ('M TQ', 'Docente',      null,           2, 'OTRA',            null,   'ESCUÉLA NUEVA',    '2026-03-11 14:00:00-03'),
    ('M TQ', 'Docente',      null,           3, 'OTRA',            null,   'Escuela Nueva',    '2026-03-11 15:00:00-03'),
    ('M TP', 'Docente',      null,           2, 'PADRON',          '9103', null,               '2026-03-09 23:59:00-03'),
    ('M TP', 'Supervisor/a', null,           1, 'SIN_INSTITUCION', null,   null,               '2026-03-13 00:00:00-03'),
    ('M TP', 'Supervisor/a', null,           3, 'SIN_INSTITUCION', null,   null,               '2026-03-11 16:00:00-03'),
    ('M TP', 'Docente',      null,           4, 'OTRA',            null,   'Fuera de periodo', '2026-02-01 12:00:00-03'),
    ('M TP', 'Docente',      null,           4, 'SIN_INSTITUCION', null,   null,               '2026-03-31 22:00:00-03')
  ) as v(taller, cargo, cargo_otro, loc, tipo, cue, otra, fh)
  join public.taller t on t.nombre = v.taller
  left join public.establecimiento e on e.cue = v.cue;

-- Estructura y privilegios (como postgres) -------------------------------------------
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'registro_descarga'
             and indexname = 'registro_descarga_fecha_hora_idx' and indexdef like '%(fecha_hora)%'),
  'existe el indice registro_descarga_fecha_hora_idx sobre fecha_hora');

select results_eq(
  $$select proname::text collate "default" from pg_proc
     where pronamespace = 'public'::regnamespace and proname like 'metricas\_%' order by proname$$,
  $$values ('metricas_por_cargo'::text), ('metricas_por_localidad'), ('metricas_por_nivel'), ('metricas_por_periodo'),
           ('metricas_por_taller'), ('metricas_registros'), ('metricas_resumen')$$,
  'existen exactamente las siete funciones metricas_*');

select is_empty(
  $$select proname::text from pg_proc
     where pronamespace = 'public'::regnamespace and proname like 'metricas\_%'
       and (prosecdef or not coalesce(proconfig @> array['search_path=""'], false))$$,
  'todas las metricas_* son invoker y fijan search_path vacio');

select is_empty(
  $$select p.proname::text from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname like 'metricas\_%'
       and (p.proacl is null
            or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))$$,
  'ninguna metricas_* da EXECUTE a public (ni lo deja por defecto)');

select is_empty(
  $$select p.proname::text from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname like 'metricas\_%'
       and has_function_privilege('anon', p.oid, 'execute')$$,
  'ninguna metricas_* da EXECUTE a anon');

select is_empty(
  $$select p.proname::text from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname like 'metricas\_%'
       and not has_function_privilege('authenticated', p.oid, 'execute')$$,
  'toda metricas_* da EXECUTE a authenticated');

select results_eq(
  $$select proname::text collate "default", pg_get_function_identity_arguments(oid)::text collate "default" from pg_proc
     where pronamespace = 'public'::regnamespace and proname like 'metricas\_%' and proname <> 'metricas_registros' order by proname$$,
  $$values ('metricas_por_cargo'::text, 'p_desde date, p_hasta date'::text), ('metricas_por_localidad', 'p_desde date, p_hasta date'),
           ('metricas_por_nivel', 'p_desde date, p_hasta date'), ('metricas_por_periodo', 'p_desde date, p_hasta date, p_por_mes boolean'),
           ('metricas_por_taller', 'p_desde date, p_hasta date'), ('metricas_resumen', 'p_desde date, p_hasta date')$$,
  'las RPC tienen los parametros del contrato (por_periodo suma p_por_mes)');

select results_eq(
  $$select array_to_string(proargnames, ',')::text collate "default" from pg_proc
     where pronamespace = 'public'::regnamespace and proname = 'metricas_registros'$$,
  $$values ('p_desde,p_hasta,id,taller_id,cargo,localidad_id,institucion_tipo,establecimiento_id,institucion_otra,fecha_hora,dia'::text)$$,
  'metricas_registros tiene los parametros y las columnas del contrato (sin cargo_otro)');

-- Admin: metricas_registros (bordes, dia y columnas) -------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"88888888-8888-8888-8888-888888888888","app_metadata":{"admin":true}}';

select results_eq(
  $$select count(*)::int from public.metricas_registros('2026-03-10', '2026-03-12')$$,
  array[8], 'registros: el periodo base devuelve los ocho registros esperados');
select results_eq(
  $$select count(*)::int from public.metricas_registros('2026-03-10', '2026-03-12') where fecha_hora = '2026-03-10 00:00:00-03'$$,
  array[1], 'registros: entra el registro de las 00:00 (Argentina) del dia desde');
select results_eq(
  $$select count(*)::int from public.metricas_registros('2026-03-10', '2026-03-12') where fecha_hora = '2026-03-12 23:59:00-03'$$,
  array[1], 'registros: entra el registro de las 23:59 (Argentina, 02:59 UTC del dia siguiente) del dia hasta');
select results_eq(
  $$select count(*)::int from public.metricas_registros('2026-03-10', '2026-03-12') where fecha_hora = '2026-03-09 23:59:00-03'$$,
  array[0], 'registros: queda afuera el registro de las 23:59 (Argentina) del dia anterior a desde');
select results_eq(
  $$select count(*)::int from public.metricas_registros('2026-03-10', '2026-03-12') where fecha_hora = '2026-03-13 00:00:00-03'$$,
  array[0], 'registros: queda afuera el registro de las 00:00 (Argentina) del dia siguiente a hasta');
select results_eq(
  $$select count(*)::int from public.metricas_registros('2026-03-10', '2026-03-10')$$,
  array[1], 'registros: un periodo de un solo dia (desde = hasta) devuelve solo ese dia');
select results_eq(
  $$select dia::text from public.metricas_registros('2026-03-12', '2026-03-12')$$,
  array['2026-03-12'], 'registros: dia es la fecha local (las 23:59 del 12 no pasan al 13 por UTC)');
select results_eq(
  $$select dia::text from public.metricas_registros('2026-03-31', '2026-03-31')$$,
  array['2026-03-31'], 'registros: dia del 31/03 22:00 (01:00 UTC del 1/04) sigue siendo el 31');
select results_eq(
  $$select id, taller_id, cargo::text, localidad_id, institucion_tipo::text, establecimiento_id, institucion_otra::text,
           fecha_hora
      from public.metricas_registros('2026-03-10', '2026-03-10')$$,
  $$select r.id, r.taller_id, r.cargo::text, r.localidad_id, r.institucion_tipo::text, r.establecimiento_id,
           r.institucion_otra::text, r.fecha_hora
      from public.registro_descarga r where r.fecha_hora = '2026-03-10 00:00:00-03'$$,
  'registros: devuelve las columnas de la fila sin transformarlas');
select throws_ok(
  $$select cargo_otro from public.metricas_registros('2026-03-10', '2026-03-12')$$,
  '42703', null, 'registros: no expone cargo_otro');
select lives_ok(
  $$select 1 from public.metricas_registros('2020-01-01', '2020-01-01')$$,
  'registros: el tope inferior 2020-01-01 es valido');
select lives_ok(
  $$select 1 from public.metricas_registros((now() at time zone 'America/Argentina/Buenos_Aires')::date,
                                              (now() at time zone 'America/Argentina/Buenos_Aires')::date)$$,
  'registros: hasta = hoy (fecha local) es valido');

-- Admin: resumen ------------------------------------------------------------------------------
select results_eq(
  $$select descargas, establecimientos_alcanzados, sin_vincular from public.metricas_resumen('2026-03-10', '2026-03-12')$$,
  $$values (8::bigint, 3::bigint, 3::bigint)$$,
  'resumen: 8 descargas; 3 establecimientos alcanzados (A, B inactivo y D vinculada); 3 pares sin vincular (sin periodo)');
select results_eq(
  $$select talleres_publicados from public.metricas_resumen('2026-03-10', '2026-03-12')$$,
  $$select count(*)::bigint from public.taller where estado = 'PUBLICADO'$$,
  'resumen: talleres_publicados es el estado actual (TP, TQ y TP2 entre ellos)');
select results_eq(
  $$select count(*)::int from public.metricas_resumen('2026-03-10', '2026-03-12')$$,
  array[1], 'resumen: devuelve una sola fila');
select results_eq(
  $$select descargas, establecimientos_alcanzados, sin_vincular from public.metricas_resumen('2026-03-13', '2026-03-13')$$,
  $$values (1::bigint, 0::bigint, 3::bigint)$$,
  'resumen: sin_vincular no depende del periodo (el dia 13 tiene 1 descarga, 0 alcanzados y los mismos 3 pares)');
select results_eq(
  $$select descargas, establecimientos_alcanzados from public.metricas_resumen('2026-03-20', '2026-03-21')$$,
  $$values (0::bigint, 0::bigint)$$,
  'resumen: un periodo sin descargas devuelve una fila en 0');
select results_eq(
  $$select array_to_string(proargnames, ',')::text collate "default" from pg_proc
     where pronamespace = 'public'::regnamespace and proname = 'metricas_resumen'$$,
  $$values ('p_desde,p_hasta,descargas,establecimientos_alcanzados,talleres_publicados,sin_vincular'::text)$$,
  'resumen: las columnas son las del contrato y no incluye normativas');

-- Admin: por periodo ---------------------------------------------------------------------------
select results_eq(
  $$select inicio::text, descargas from public.metricas_por_periodo('2026-03-08', '2026-03-14', false) order by inicio$$,
  $$values ('2026-03-08'::text, 0::bigint), ('2026-03-09', 1), ('2026-03-10', 1), ('2026-03-11', 6), ('2026-03-12', 1),
           ('2026-03-13', 1), ('2026-03-14', 0)$$,
  'por_periodo: por dia, con los dias sin descargas en 0 (7 filas, la de las 23:59 en el dia 12)');
select results_eq(
  $$select inicio::text, descargas from public.metricas_por_periodo('2026-03-01', '2026-04-30', true) order by inicio$$,
  $$values ('2026-03-01'::text, 11::bigint), ('2026-04-01', 0)$$,
  'por_periodo: por mes sobre la fecha local (el 31/03 22:00 queda en marzo) y abril en 0');
select results_eq(
  $$select count(*)::int from public.metricas_por_periodo('2026-03-10', '2026-03-12', false)$$,
  array[3], 'por_periodo: por dia respeta los bordes del periodo (3 filas)');

-- Admin: por taller -----------------------------------------------------------------------------
select results_eq(
  $$select titulo::text, estado::text, descargas from public.metricas_por_taller('2026-03-10', '2026-03-12')
     where titulo like 'M %' order by titulo$$,
  $$values ('M TI'::text, 'INACTIVO'::text, 1::bigint), ('M TP', 'PUBLICADO', 3), ('M TQ', 'PUBLICADO', 4)$$,
  'por_taller: solo talleres con descargas, de cualquier estado (el inactivo entra; borrador y TP2 sin descargas no)');
select results_eq(
  $$select count(*)::int from public.metricas_por_taller('2026-03-10', '2026-03-12') m
     join public.taller t on t.id = m.taller_id where t.nombre = 'M TP' and m.titulo = t.nombre$$,
  array[1], 'por_taller: taller_id apunta al taller y titulo es su nombre');

-- Admin: por nivel ------------------------------------------------------------------------------
select results_eq(
  $$select nivel_id::int, nombre::text, descargas from public.metricas_por_nivel('2026-03-10', '2026-03-12') order by nivel_id$$,
  $$values (1, 'Inicial'::text, 4::bigint), (2, 'Primario', 4), (3, 'Secundario', 0), (4, 'Terciario', 0),
           (5, 'Formación profesional', 0)$$,
  'por_nivel: los cinco niveles, los que no tienen descargas en 0, por la categoria actual del taller');
select results_eq(
  $$select sum(descargas)::int from public.metricas_por_nivel('2026-03-20', '2026-03-21')$$,
  array[0], 'por_nivel: sin descargas devuelve igual los cinco niveles en 0');
select results_eq(
  $$select count(*)::int from public.metricas_por_nivel('2026-03-20', '2026-03-21')$$,
  array[5], 'por_nivel: sin descargas son cinco filas');

-- Admin: por cargo ------------------------------------------------------------------------------
select results_eq(
  $$select cargo::text, descargas from public.metricas_por_cargo('2026-03-10', '2026-03-12') order by cargo$$,
  $$values ('Director/a'::text, 1::bigint), ('Docente', 4), ('Otro', 2), ('Supervisor/a', 1)$$,
  'por_cargo: solo cargos con descargas y "Otro" agrupado (Bibliotecaria y Pasante juntos)');
select results_eq(
  $$select count(*)::int from public.metricas_por_cargo('2026-03-20', '2026-03-21')$$,
  array[0], 'por_cargo: sin descargas no devuelve filas');

-- Admin: por localidad ----------------------------------------------------------------------------
select results_eq(
  $$select count(*)::int from public.metricas_por_localidad('2026-03-10', '2026-03-12')$$,
  array[79], 'por_localidad: devuelve las 79 localidades');
select results_eq(
  $$select count(*)::int from public.metricas_por_localidad('2026-03-10', '2026-03-12') m
     join public.localidad l on l.id = m.localidad_id where m.nombre = l.nombre$$,
  array[79], 'por_localidad: localidad_id y nombre son los de la tabla localidad');
select results_eq(
  $$select localidad_id::int, descargas, alcanzados from public.metricas_por_localidad('2026-03-10', '2026-03-12')
     where localidad_id in (1, 2, 3, 4) order by localidad_id$$,
  $$values (1, 3::bigint, 2::bigint), (2, 3, 0), (3, 2, 0), (4, 0, 0)$$,
  'por_localidad: descargas por localidad declarada; alcanzados por la del establecimiento (A y D en loc 1; B inactivo no cuenta; la OTRA vinculada si)');
select results_eq(
  $$select count(*)::int from public.metricas_por_localidad('2026-03-10', '2026-03-12') m
     where m.padron <> (select count(*) from public.establecimiento e where e.localidad_id = m.localidad_id and e.activo)$$,
  array[0], 'por_localidad: padron son los establecimientos activos de la localidad (no cuenta el inactivo)');
select results_eq(
  $$select padron from public.metricas_por_localidad('2026-03-10', '2026-03-12') where localidad_id = 1$$,
  $$select count(*)::bigint from public.establecimiento where localidad_id = 1 and activo$$,
  'por_localidad: el padron de la localidad 1 cuenta A y D y no el inactivo B');
select results_eq(
  $$select sum(descargas)::int from public.metricas_por_localidad('2026-03-10', '2026-03-12')$$,
  array[8], 'por_localidad: la suma de descargas coincide con el total del periodo');
select results_eq(
  $$select alcanzados from public.metricas_por_localidad('2026-03-09', '2026-03-09') where localidad_id = 2$$,
  array[1::bigint], 'por_localidad: un establecimiento activo alcanzado se atribuye a su localidad (E_C en loc 2 el dia 9)');

-- Seguridad: authenticated sin la marca de admin -> 42501 --------------------------------------------
set local request.jwt.claims =
  '{"role":"authenticated","sub":"88888888-8888-8888-8888-888888888888","app_metadata":{}}';
select throws_ok(
  $$select * from public.metricas_registros('2026-03-10', '2026-03-12')$$,
  '42501', null, 'sin marca: metricas_registros da 42501');
select throws_ok(
  $$select * from public.metricas_registros(null::date, null::date)$$,
  '42501', null, 'sin marca: el 42501 va antes que la validacion del periodo');
do $$
declare
  c text;
  calls text[] := array[
    $c$select count(*) from public.metricas_registros('2026-03-10', '2026-03-12')$c$,
    $c$select count(*) from public.metricas_resumen('2026-03-10', '2026-03-12')$c$,
    $c$select count(*) from public.metricas_por_periodo('2026-03-10', '2026-03-12', false)$c$,
    $c$select count(*) from public.metricas_por_taller('2026-03-10', '2026-03-12')$c$,
    $c$select count(*) from public.metricas_por_nivel('2026-03-10', '2026-03-12')$c$,
    $c$select count(*) from public.metricas_por_cargo('2026-03-10', '2026-03-12')$c$,
    $c$select count(*) from public.metricas_por_localidad('2026-03-10', '2026-03-12')$c$];
  n int := 0;
begin
  foreach c in array calls loop
    begin
      execute c;
    exception when others then
      if sqlstate = '42501' then n := n + 1; end if;
    end;
  end loop;
  perform set_config('test.n_42501_sinmarca', n::text, true);
end $$;
select is(current_setting('test.n_42501_sinmarca'), '7', 'sin marca: las siete funciones dan 42501');

-- Seguridad: admin con periodo invalido -> 22023 (cada RPC lo propaga) ---------------------------------
set local request.jwt.claims =
  '{"role":"authenticated","sub":"88888888-8888-8888-8888-888888888888","app_metadata":{"admin":true}}';
select throws_ok(
  $$select * from public.metricas_registros(null::date, '2026-03-12')$$,
  '22023', null, 'registros: desde nulo da 22023');
select throws_ok(
  $$select * from public.metricas_registros('2026-03-10', null::date)$$,
  '22023', null, 'registros: hasta nulo da 22023');
select throws_ok(
  $$select * from public.metricas_registros('2026-03-12', '2026-03-10')$$,
  '22023', null, 'registros: desde mayor que hasta da 22023');
select throws_ok(
  $$select * from public.metricas_registros('2019-12-31', '2020-01-05')$$,
  '22023', null, 'registros: desde anterior a 2020-01-01 da 22023');
select throws_ok(
  $$select * from public.metricas_registros('2026-03-10',
       (now() at time zone 'America/Argentina/Buenos_Aires')::date + 1)$$,
  '22023', null, 'registros: hasta posterior a hoy (fecha local) da 22023');
do $$
declare
  c text;
  calls text[] := array[
    $c$select count(*) from public.metricas_resumen('2026-03-12', '2026-03-10')$c$,
    $c$select count(*) from public.metricas_por_periodo('2026-03-12', '2026-03-10', false)$c$,
    $c$select count(*) from public.metricas_por_periodo(null::date, '2026-03-10', true)$c$,
    $c$select count(*) from public.metricas_por_taller('2019-12-31', '2026-03-10')$c$,
    $c$select count(*) from public.metricas_por_nivel('2026-03-10', (now() at time zone 'America/Argentina/Buenos_Aires')::date + 1)$c$,
    $c$select count(*) from public.metricas_por_cargo(null::date, null::date)$c$,
    $c$select count(*) from public.metricas_por_localidad('2026-03-12', '2026-03-10')$c$];
  n int := 0;
begin
  foreach c in array calls loop
    begin
      execute c;
    exception when others then
      if sqlstate = '22023' then n := n + 1; end if;
    end;
  end loop;
  perform set_config('test.n_22023', n::text, true);
end $$;
select is(current_setting('test.n_22023'), '7', 'admin: las seis RPC propagan el 22023 (por_periodo con dos casos)');

-- Seguridad: anon sin EXECUTE -------------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
declare
  c text;
  calls text[] := array[
    $c$select count(*) from public.metricas_registros('2026-03-10', '2026-03-12')$c$,
    $c$select count(*) from public.metricas_resumen('2026-03-10', '2026-03-12')$c$,
    $c$select count(*) from public.metricas_por_periodo('2026-03-10', '2026-03-12', false)$c$,
    $c$select count(*) from public.metricas_por_taller('2026-03-10', '2026-03-12')$c$,
    $c$select count(*) from public.metricas_por_nivel('2026-03-10', '2026-03-12')$c$,
    $c$select count(*) from public.metricas_por_cargo('2026-03-10', '2026-03-12')$c$,
    $c$select count(*) from public.metricas_por_localidad('2026-03-10', '2026-03-12')$c$];
  n int := 0;
begin
  foreach c in array calls loop
    begin
      execute c;
    exception when others then
      if sqlstate = '42501' then n := n + 1; end if;
    end;
  end loop;
  perform set_config('test.n_anon', n::text, true);
end $$;
select is(current_setting('test.n_anon'), '7', 'anon: las siete funciones dan 42501 (sin EXECUTE)');
reset role;

select * from finish();
rollback;
