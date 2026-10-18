-- Instituciones sin vincular (issue #19; docs/specs/instituciones-sin-vincular/spec.md y critica.md, seccion Respuesta).
-- No depende del seed: todo el soporte se crea dentro de la transaccion (rollback al final). Supone una base sin registros ni
-- padron previos (la que deja `npm run db:reset`).
--
-- CONTRATO (lo que debe cumplir la migracion; el test llama por nombre):
--
--   public.instituciones_sin_vincular()
--     returns table (localidad_id smallint, localidad varchar, nombre text/varchar, variantes text[], descargas bigint,
--                    ultima timestamptz)
--     SECURITY INVOKER, search_path vacio, EXECUTE solo authenticated (ni public, anon ni service_role), 42501 si not es_admin().
--     Una fila por grupo (localidad_id, lower(inmutable_unaccent(btrim(institucion_otra)))) de los registros OTRA sin
--     establecimiento_id (la misma clave que metricas_resumen.sin_vincular).
--       nombre    = la forma mas frecuente; en empate, la de la descarga mas reciente.
--       variantes = las otras formas escritas, distintas; '{}' (nunca null) si hay una sola.
--       descargas = cantidad de registros del grupo; ultima = max(fecha_hora).
--     Orden: descargas desc, ultima desc, localidad_id, nombre (con las mismas descargas, primero la descarga mas reciente).
--
--   public.vincular_institucion(p_localidad_id smallint, p_nombre text, p_establecimiento_id int) returns int
--     SECURITY DEFINER, search_path vacio, EXECUTE solo authenticated (ni service_role). es_admin() -> 42501 (primero). Normaliza p_nombre con la
--     misma clave. El establecimiento debe existir, estar activo y ser de p_localidad_id: si no, DA005 (se bloquea con FOR SHARE).
--     Actualiza SOLO establecimiento_id de los registros OTRA con establecimiento_id nulo de ese grupo; devuelve cuantos (0 si
--     ya estaban vinculados o no hay grupo). institucion_tipo e institucion_otra no cambian. Sin grant de UPDATE ni politica:
--     un UPDATE directo del admin sigue dando 42501.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

-- Soporte del test (como postgres) ---------------------------------------------
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999999',
        'authenticated', 'authenticated', 'vinculacion-admin@test.local');

insert into public.categoria (nivel_id, nombre, descripcion, activo) values (1, 'Cat Vinc', 'base', true);
insert into public.taller (categoria_id, nombre, descripcion, estado, created_at, updated_at)
select c.id, 'V Pub', 'd', 'PUBLICADO'::public.estado_taller, '2020-01-01', '2020-01-01'
  from public.categoria c where c.nombre = 'Cat Vinc';

-- E1 activo (loc 10), E2 inactivo (loc 10), E3 activo (loc 11), E4 activo (loc 10)
insert into public.establecimiento (cue, nombre, localidad_id, activo)
values ('9701', 'Vinc E1', 10, true), ('9702', 'Vinc E2 inactivo', 10, false),
       ('9703', 'Vinc E3', 11, true), ('9704', 'Vinc E4', 10, true);

do $$
begin
  perform set_config('test.e1', (select id::text from public.establecimiento where cue = '9701'), true);
  perform set_config('test.e2', (select id::text from public.establecimiento where cue = '9702'), true);
  perform set_config('test.e3', (select id::text from public.establecimiento where cue = '9703'), true);
  perform set_config('test.e4', (select id::text from public.establecimiento where cue = '9704'), true);
end $$;

-- Grupos sin vincular:
--   G1 (loc 10) 'Escuela Núñez' x2 + 'ESCUELA NUNEZ' x1 (la mas reciente)        -> 3 descargas, ultima 03-12 10:00
--   G3 (loc 11) 'Esc Tie' (03-05) y 'ESC TIE' (03-06): empate, gana la reciente   -> 2 descargas
--   G2 (loc 10) 'Escuela Única' x1; G6 (loc 11) 'Escuela Núñez' x1; G4 (loc 11) 'Zeta' x1 (todas con ultima 03-04 12:00)
--   G7 (loc 12) 'Último' x1 con ultima 03-20: con las mismas descargas que G2, G6 y G4 va primero por ser mas reciente,
--   aunque por localidad y nombre iria al final (distingue `ultima desc` del desempate por localidad_id y nombre)
-- Fuera de la lista: OTRA ya vinculada (E4), PADRON y SIN_INSTITUCION.
insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo, establecimiento_id, institucion_otra,
                                      fecha_hora)
select t.id, 'Docente', v.loc, v.tipo::public.tipo_institucion,
       case when v.est = 'e4' then current_setting('test.e4')::int end, v.otra, v.fh::timestamptz
  from (values
    (10::smallint, 'OTRA',            null::text, 'Escuela Núñez'::text, '2026-03-10 10:00:00-03'),
    (10, 'OTRA',            null,   'Escuela Núñez',  '2026-03-11 10:00:00-03'),
    (10, 'OTRA',            null,   'ESCUELA NUNEZ',  '2026-03-12 10:00:00-03'),
    (11, 'OTRA',            null,   'Esc Tie',        '2026-03-05 09:00:00-03'),
    (11, 'OTRA',            null,   'ESC TIE',        '2026-03-06 09:00:00-03'),
    (10, 'OTRA',            null,   'Escuela Única',  '2026-03-04 12:00:00-03'),
    (11, 'OTRA',            null,   'Escuela Núñez',  '2026-03-04 12:00:00-03'),
    (11, 'OTRA',            null,   'Zeta',           '2026-03-04 12:00:00-03'),
    (12, 'OTRA',            null,   'Último',         '2026-03-20 12:00:00-03'),
    (10, 'OTRA',            'e4',   'Escuela Núñez',  '2026-03-13 10:00:00-03'),
    (10, 'OTRA',            'e4',   'Ya vinculada',   '2026-03-13 11:00:00-03'),
    (10, 'PADRON',          'e4',   null,             '2026-03-13 12:00:00-03'),
    (10, 'SIN_INSTITUCION', null,   null,             '2026-03-13 13:00:00-03')
  ) as v(loc, tipo, est, otra, fh)
  cross join (select id from public.taller where nombre = 'V Pub') t;

-- Estructura y privilegios (como postgres) -------------------------------------------
select has_function('public', 'instituciones_sin_vincular', 'existe instituciones_sin_vincular()');
select has_function('public', 'vincular_institucion', 'existe vincular_institucion()');

select is_empty(
  $$select proname::text from pg_proc
     where pronamespace = 'public'::regnamespace and proname = 'instituciones_sin_vincular' and prosecdef$$,
  'instituciones_sin_vincular es security invoker (solo lee; la RLS ya exige al admin)');

select is_empty(
  $$select proname::text from pg_proc
     where pronamespace = 'public'::regnamespace and proname in ('instituciones_sin_vincular', 'vincular_institucion')
       and not coalesce(proconfig @> array['search_path=""'], false)$$,
  'las dos funciones fijan search_path vacio');

select is_empty(
  $$select proname::text from pg_proc
     where pronamespace = 'public'::regnamespace and proname = 'vincular_institucion' and not prosecdef$$,
  'vincular_institucion es security definer (la escritura solo pasa por la RPC)');

select is_empty(
  $$select proname::text from pg_proc
     where pronamespace = 'public'::regnamespace and proname in ('instituciones_sin_vincular', 'vincular_institucion')
       and has_function_privilege('anon', oid, 'execute')$$,
  'anon no tiene EXECUTE en ninguna de las dos');

select is_empty(
  $$select p.proname::text from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname in ('instituciones_sin_vincular', 'vincular_institucion')
       and (p.proacl is null
            or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))$$,
  'ninguna da EXECUTE a public (ni lo deja por defecto)');

select is_empty(
  $$select proname::text from pg_proc
     where pronamespace = 'public'::regnamespace and proname in ('instituciones_sin_vincular', 'vincular_institucion')
       and has_function_privilege('service_role', oid, 'execute')$$,
  'service_role no tiene EXECUTE en ninguna de las dos (el diseno dice solo authenticated)');

select results_eq(
  $$select count(*)::int from pg_proc
     where pronamespace = 'public'::regnamespace and proname in ('instituciones_sin_vincular', 'vincular_institucion')
       and has_function_privilege('authenticated', oid, 'execute')$$,
  array[2], 'authenticated tiene EXECUTE en las dos');

-- Admin: la lista -------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"99999999-9999-9999-9999-999999999999","app_metadata":{"admin":true}}';

select results_eq(
  $$select count(*)::int from public.instituciones_sin_vincular()$$,
  array[6], 'lista: seis grupos (se agrupa sin distinguir mayusculas ni tildes y por localidad)');

select results_eq(
  $$select count(*)::bigint from public.instituciones_sin_vincular()$$,
  $$select sin_vincular from public.metricas_resumen('2026-03-01', '2026-03-31')$$,
  'lista: la cantidad de grupos es la misma que metricas_resumen.sin_vincular');

select results_eq(
  $$select localidad_id::int, nombre::text, variantes::text[], descargas::int from public.instituciones_sin_vincular()$$,
  $$values (10, 'Escuela Núñez'::text, array['ESCUELA NUNEZ']::text[], 3),
           (11, 'ESC TIE', array['Esc Tie'], 2),
           (12, 'Último', '{}'::text[], 1),
           (10, 'Escuela Única', '{}'::text[], 1),
           (11, 'Escuela Núñez', '{}'::text[], 1),
           (11, 'Zeta', '{}'::text[], 1)$$,
  'lista: nombre mas frecuente (en empate, la forma mas reciente), otras variantes y orden descargas desc, ultima desc, localidad, nombre');

select results_eq(
  $$select localidad::text from public.instituciones_sin_vincular() where localidad_id = 10 and nombre = 'Escuela Núñez'$$,
  $$select nombre::text from public.localidad where id = 10$$,
  'lista: incluye el nombre de la localidad');

select results_eq(
  $$select ultima from public.instituciones_sin_vincular() where nombre in ('Escuela Núñez', 'ESC TIE') and localidad_id in (10, 11)
     and descargas > 1 order by descargas desc$$,
  $$values ('2026-03-12 10:00:00-03'::timestamptz), ('2026-03-06 09:00:00-03'::timestamptz)$$,
  'lista: ultima es la fecha_hora mas reciente del grupo');

select results_eq(
  $$select variantes from public.instituciones_sin_vincular() where nombre = 'Escuela Única'$$,
  $$select '{}'::text[]$$,
  'lista: un grupo con una sola forma escrita tiene variantes = {} y no null');

select results_eq(
  $$select count(*)::int from public.instituciones_sin_vincular() where nombre = 'Ya vinculada'$$,
  array[0], 'lista: las OTRA ya vinculadas no aparecen');

-- Sin marca de admin y anon ------------------------------------------------------------
set local request.jwt.claims =
  '{"role":"authenticated","sub":"99999999-9999-9999-9999-999999999999","app_metadata":{}}';
select throws_ok(
  $$select * from public.instituciones_sin_vincular()$$,
  '42501', null, 'sin marca: listar da 42501');
select throws_ok(
  format($$select public.vincular_institucion('10', 'Escuela Núñez', '%s')$$, current_setting('test.e2')),
  '42501', null, 'sin marca: vincular da 42501 aun con un establecimiento inactivo (es_admin() va antes que DA005)');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$select * from public.instituciones_sin_vincular()$$,
  '42501', null, 'anon: listar da 42501 (sin EXECUTE)');
select throws_ok(
  format($$select public.vincular_institucion('10', 'Escuela Núñez', '%s')$$, current_setting('test.e1')),
  '42501', null, 'anon: vincular da 42501 (sin EXECUTE)');

-- Admin: vincular --------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"99999999-9999-9999-9999-999999999999","app_metadata":{"admin":true}}';

select throws_ok(
  format($$select public.vincular_institucion('10', 'Escuela Núñez', '%s')$$, current_setting('test.e2')),
  'DA005', null, 'vincular a un establecimiento inactivo da DA005');
select throws_ok(
  format($$select public.vincular_institucion('10', 'Escuela Núñez', '%s')$$, current_setting('test.e3')),
  'DA005', null, 'vincular a un establecimiento de otra localidad da DA005');
select throws_ok(
  $$select public.vincular_institucion('10', 'Escuela Núñez', '2147483647')$$,
  'DA005', null, 'vincular a un establecimiento inexistente da DA005');
select results_eq(
  $$select count(*)::int from public.registro_descarga
     where localidad_id = 10 and institucion_otra in ('Escuela Núñez', 'ESCUELA NUNEZ') and establecimiento_id is null$$,
  array[3], 'los rechazos no modificaron ningun registro');

select results_eq(
  format($$select public.vincular_institucion('10', 'Escuela Núñez', '%s')::int$$, current_setting('test.e1')),
  array[3], 'vincular devuelve la cantidad de registros del grupo (3)');
select results_eq(
  $$select count(*)::int from public.registro_descarga
     where localidad_id = 10 and establecimiento_id = current_setting('test.e1')::int$$,
  array[3], 'los tres registros del grupo toman el establecimiento_id');
select results_eq(
  $$select institucion_tipo::text, institucion_otra::text from public.registro_descarga
     where establecimiento_id = current_setting('test.e1')::int order by institucion_otra collate "C"$$,
  $$values ('OTRA'::text, 'ESCUELA NUNEZ'::text), ('OTRA', 'Escuela Núñez'), ('OTRA', 'Escuela Núñez')$$,
  'siguen OTRA y conservan institucion_otra tal como se escribio');
select results_eq(
  $$select count(*)::int from public.registro_descarga
     where localidad_id = 10 and institucion_otra = 'Escuela Núñez' and establecimiento_id = current_setting('test.e4')::int$$,
  array[1], 'un registro del mismo nombre ya vinculado a otro establecimiento no se pisa');
select results_eq(
  $$select count(*)::int from public.registro_descarga
     where localidad_id = 11 and institucion_otra = 'Escuela Núñez' and establecimiento_id is null$$,
  array[1], 'el mismo nombre en otra localidad sigue sin vincular');
select results_eq(
  format($$select public.vincular_institucion('10', 'Escuela Núñez', '%s')::int$$, current_setting('test.e1')),
  array[0], 'vincular un grupo que ya estaba vinculado devuelve 0');
select results_eq(
  $$select count(*)::bigint from public.instituciones_sin_vincular()$$,
  $$select sin_vincular from public.metricas_resumen('2026-03-01', '2026-03-31')$$,
  'despues de vincular, la lista y metricas_resumen.sin_vincular coinciden');
select results_eq(
  $$select count(*)::int from public.instituciones_sin_vincular()$$,
  array[5], 'el grupo vinculado desaparece de la lista (baja 1)');

select results_eq(
  format($$select public.vincular_institucion('10', '  ESCUELA UNICA ', '%s')::int$$, current_setting('test.e4')),
  array[1], 'el nombre se normaliza (espacios, mayusculas y tildes) para encontrar el grupo');
select results_eq(
  format($$select public.vincular_institucion('10', 'No existe', '%s')::int$$, current_setting('test.e1')),
  array[0], 'un nombre sin grupo devuelve 0');

-- Auditoria y UPDATE directo ------------------------------------------------------------
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'registro_descarga' and operacion = 'UPDATE'
       and usuario_id = '99999999-9999-9999-9999-999999999999'$$,
  array[4], 'cada registro vinculado queda en registro_operacion con el usuario del admin (3 + 1)');

select throws_ok(
  $$update public.registro_descarga set establecimiento_id = null where institucion_otra = 'Zeta'$$,
  '42501', null, 'admin: un UPDATE directo de establecimiento_id sigue dando 42501 (solo la RPC escribe)');

reset role;
select * from finish();
rollback;
