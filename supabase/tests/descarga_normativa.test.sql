-- #32 (docs/specs/descargas-normativas-periodo/spec.md): conteo diario de descargas de normativas.
-- Criterios 1, 2, 5, 6 y 7 en la base: tabla descarga_normativa_dia, contar_descarga_normativa() (misma firma, suma el contador y el
-- conteo del dia en una sentencia) y la RPC metricas_normativas(p_desde, p_hasta). No depende del seed: todo el soporte se crea dentro
-- de la transaccion (rollback al final). Supone una base sin normativas previas que empiecen con 'DN ' o 'DX '.
--
-- CONTRATO:
--   public.descarga_normativa_dia (normativa_id int not null references normativa(id) on delete cascade, dia date not null,
--     descargas int not null check (descargas > 0), primary key (normativa_id, dia)). Sin updated_at, sin auditar(). RLS activo con select solo
--     es_admin(); revoke all a anon y authenticated y grant select a authenticated; sin grants de escritura.
--   public.contar_descarga_normativa(p_id int): suma 1 a normativa.descargas y 1 al conteo de (p_id, hoy en America/Argentina/
--     Buenos_Aires). Con es_admin() o un id inexistente no cambia nada y no falla.
--   public.metricas_normativas(p_desde date, p_hasta date) returns table (id int, titulo varchar, numero varchar, anio smallint,
--     descargas int, descargas_periodo bigint): una fila por normativa; descargas_periodo = suma de los dias en [desde, hasta]
--     (inclusivo), 0 si no hay. 42501 sin es_admin() (se evalua primero), 22023 con un periodo invalido.
--
-- NOTAS DE DISENO:
-- - El reloj no se puede fijar: now() es constante dentro de la transaccion y no hay una funcion de reloj inyectable. Por eso "23:30 y
--   00:30 locales caen en dias distintos" NO es testeable de forma deterministica en pgTAP. Lo que si se verifica: el dia guardado es
--   la fecha de Argentina de now() aunque la zona horaria de la sesion sea otra (Pacific/Kiritimati UTC+14 y Pacific/Pago_Pago UTC-11,
--   donde current_date o la zona de sesion darian otro dia). La medianoche exacta queda para verificar a mano o con una revision del
--   codigo de la funcion.
-- - Todo el soporte de escritura va como postgres y ANTES de poner claims (auditar() no deja escribir a postgres con claims).
-- - Un select sobre la tabla sin la marca de admin devuelve 0 filas (RLS), no 42501; el 42501 es de anon (sin grant de select) y de
--   cualquier escritura.
begin;
create extension if not exists pgtap with schema extensions;
select plan(74);

-- Soporte del test (como postgres) ---------------------------------------------
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999999',
        'authenticated', 'authenticated', 'dn-admin@test.local');

insert into public.normativa (titulo, numero, anio, ruta_archivo, descargas, created_at, updated_at) values
  ('DN A',      'dn-1', 2024, 'dddddddd-dddd-dddd-dddd-ddddddddddd1.pdf', 10, '2020-01-01', '2020-01-01'),
  ('DN B',      'dn-2', 2024, 'dddddddd-dddd-dddd-dddd-ddddddddddd2.pdf',  5, '2020-01-01', '2020-01-01'),
  ('DN C',      'dn-3', 2024, 'dddddddd-dddd-dddd-dddd-ddddddddddd3.pdf',  0, '2020-01-01', '2020-01-01'),
  ('DN Borrar', 'dn-4', 2024, 'dddddddd-dddd-dddd-dddd-ddddddddddd4.pdf',  2, '2020-01-01', '2020-01-01'),
  ('DX Contar', 'dx-1', 2024, 'dddddddd-dddd-dddd-dddd-ddddddddddd5.pdf',  0, '2020-01-01', '2020-01-01'),
  ('DX Dia',    'dx-2', 2024, 'dddddddd-dddd-dddd-dddd-ddddddddddd6.pdf',  0, '2020-01-01', '2020-01-01');

-- DN A: un dia antes del periodo base, tres dentro (10, 12) y uno despues. DN Borrar se borra mas abajo (cascada).
insert into public.descarga_normativa_dia (normativa_id, dia, descargas)
select n.id, v.dia::date, v.cant
  from (values ('DN A', '2026-03-09', 1), ('DN A', '2026-03-10', 2), ('DN A', '2026-03-12', 3), ('DN A', '2026-03-13', 4),
               ('DN Borrar', '2026-03-10', 2)) as v(titulo, dia, cant)
  join public.normativa n on n.titulo = v.titulo;

-- Estructura (como postgres, sin claims) ------------------------------------------------
select has_table('public', 'descarga_normativa_dia', 'existe la tabla descarga_normativa_dia');
select col_is_pk('public', 'descarga_normativa_dia', array['normativa_id', 'dia'], 'la clave primaria es (normativa_id, dia)');
select col_type_is('public', 'descarga_normativa_dia', 'normativa_id', 'integer', 'normativa_id es integer');
select col_type_is('public', 'descarga_normativa_dia', 'dia', 'date', 'dia es date');
select col_type_is('public', 'descarga_normativa_dia', 'descargas', 'integer', 'descargas es integer');
select col_not_null('public', 'descarga_normativa_dia', 'descargas', 'descargas no admite nulos');
select throws_ok(
  $$insert into public.descarga_normativa_dia (normativa_id, dia) select id, date '2026-04-01' from public.normativa limit 1$$,
  '23502', null, 'descargas no tiene default: omitirla da 23502');
select throws_ok(
  $$insert into public.descarga_normativa_dia (normativa_id, dia, descargas) select id, date '2026-04-01', 0 from public.normativa limit 1$$,
  '23514', null, 'descargas debe ser mayor que 0: un conteo en 0 da 23514');
select hasnt_column('public', 'descarga_normativa_dia', 'updated_at', 'no tiene updated_at');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.descarga_normativa_dia'::regclass),
  'RLS esta activo en descarga_normativa_dia');
select ok(
  exists (select 1 from pg_constraint
           where conrelid = 'public.descarga_normativa_dia'::regclass and contype = 'f'
             and confrelid = 'public.normativa'::regclass and confdeltype = 'c'),
  'normativa_id referencia a normativa con ON DELETE CASCADE');
select is_empty(
  $$select 1 from pg_trigger where tgrelid = 'public.descarga_normativa_dia'::regclass and not tgisinternal$$,
  'la tabla no tiene triggers (ni auditar())');

select is_empty(
  $$select p from (values ('INSERT'), ('UPDATE'), ('DELETE')) v(p)
     where has_table_privilege('anon', 'public.descarga_normativa_dia', p)$$,
  'anon no tiene INSERT, UPDATE ni DELETE sobre la tabla');
select is_empty(
  $$select p from (values ('INSERT'), ('UPDATE'), ('DELETE')) v(p)
     where has_table_privilege('authenticated', 'public.descarga_normativa_dia', p)$$,
  'authenticated no tiene INSERT, UPDATE ni DELETE sobre la tabla');
select ok(
  not has_table_privilege('anon', 'public.descarga_normativa_dia', 'SELECT'),
  'anon no tiene SELECT sobre la tabla');
select ok(
  has_table_privilege('authenticated', 'public.descarga_normativa_dia', 'SELECT'),
  'authenticated tiene SELECT (la RLS lo limita al admin)');
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'descarga_normativa_dia' and cmd = 'SELECT'),
  'hay una politica de select');
select is_empty(
  $$select 1 from pg_policies where schemaname = 'public' and tablename = 'descarga_normativa_dia' and cmd <> 'SELECT'$$,
  'no hay politicas de escritura');

select ok(
  (select prosrc from pg_proc where oid = 'public.contar_descarga_normativa(int)'::regprocedure) like '%descarga_normativa_dia%'
  and (select prosrc from pg_proc where oid = 'public.contar_descarga_normativa(int)'::regprocedure)
        like '%America/Argentina/Buenos_Aires%',
  'contar_descarga_normativa escribe el conteo diario con el dia en America/Argentina/Buenos_Aires');
select ok(
  (select prosecdef from pg_proc where oid = 'public.contar_descarga_normativa(int)'::regprocedure)
  and (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.contar_descarga_normativa(int)'::regprocedure),
  'contar_descarga_normativa sigue siendo security definer con search_path vacio');
select ok(
  has_function_privilege('anon', 'public.contar_descarga_normativa(int)', 'execute')
  and has_function_privilege('authenticated', 'public.contar_descarga_normativa(int)', 'execute'),
  'contar_descarga_normativa sigue con EXECUTE para anon y authenticated');

-- Baja de la normativa: la cascada borra sus conteos (criterio 6) ----------------------------
select results_eq(
  $$select count(*)::int from public.descarga_normativa_dia d join public.normativa n on n.id = d.normativa_id
     where n.titulo = 'DN Borrar'$$,
  array[1], 'antes de borrar: DN Borrar tiene un conteo diario');
create temp table dn_borrar as select id from public.normativa where titulo = 'DN Borrar';
grant select on dn_borrar to authenticated;
-- La baja la hace el admin (con su DELETE sobre normativa, no el dueno): la cascada corre igual aunque no tenga DELETE sobre la tabla.
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"99999999-9999-9999-9999-999999999999","app_metadata":{"admin":true}}';
select lives_ok($$delete from public.normativa where titulo = 'DN Borrar'$$, 'admin: borra la normativa DN Borrar');
select is_empty(
  $$select 1 from public.descarga_normativa_dia where normativa_id in (select id from dn_borrar)$$,
  'borrar una normativa borra sus conteos diarios');
select results_eq(
  $$select count(*)::int from public.descarga_normativa_dia d join public.normativa n on n.id = d.normativa_id
     where n.titulo = 'DN A'$$,
  array[4], 'borrar una normativa no toca los conteos de las demas');
select results_eq(
  $$select count(*)::int from public.registro_operacion where tabla = 'descarga_normativa_dia'$$,
  array[0], 'ni los conteos ni la cascada dejan filas en registro_operacion');
reset role;

-- anon -------------------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select * from public.descarga_normativa_dia$$, '42501', null, 'anon: SELECT en la tabla da 42501');
select throws_ok(
  $$insert into public.descarga_normativa_dia (normativa_id, dia) select id, current_date from public.normativa limit 1$$,
  '42501', null, 'anon: INSERT en la tabla da 42501');
select throws_ok($$update public.descarga_normativa_dia set descargas = 99$$, '42501', null, 'anon: UPDATE en la tabla da 42501');
select throws_ok($$delete from public.descarga_normativa_dia$$, '42501', null, 'anon: DELETE en la tabla da 42501');
select throws_ok(
  $$select * from public.metricas_normativas('2026-03-10', '2026-03-12')$$,
  '42501', null, 'anon: metricas_normativas da 42501');

-- Invariante (criterio 1): N llamadas anonimas suben N el contador y el conteo del dia
select lives_ok($$select public.contar_descarga_normativa((select id from public.normativa where titulo = 'DX Contar'))$$,
  'anon: primera descarga de DX Contar');
select lives_ok($$select public.contar_descarga_normativa((select id from public.normativa where titulo = 'DX Contar'))$$,
  'anon: segunda descarga de DX Contar');
select lives_ok($$select public.contar_descarga_normativa((select id from public.normativa where titulo = 'DX Contar'))$$,
  'anon: tercera descarga de DX Contar');
select lives_ok($$select public.contar_descarga_normativa(999999)$$, 'anon: un id inexistente no falla');

-- Dia en hora de Argentina aunque la zona de la sesion sea otra
set local timezone = 'Pacific/Kiritimati';
select lives_ok($$select public.contar_descarga_normativa((select id from public.normativa where titulo = 'DX Dia'))$$,
  'anon: descarga con la sesion en UTC+14');
set local timezone = 'Pacific/Pago_Pago';
select lives_ok($$select public.contar_descarga_normativa((select id from public.normativa where titulo = 'DX Dia'))$$,
  'anon: descarga con la sesion en UTC-11');
reset timezone;
reset role;

select results_eq(
  $$select n.descargas, d.descargas, (select count(*)::int from public.descarga_normativa_dia where normativa_id = n.id)
      from public.normativa n join public.descarga_normativa_dia d on d.normativa_id = n.id
     where n.titulo = 'DX Contar'$$,
  $$values (3, 3, 1)$$,
  'tres descargas anonimas: contador 3, conteo del dia 3, una sola fila (no una por llamada)');
select results_eq(
  $$select d.dia = (now() at time zone 'America/Argentina/Buenos_Aires')::date
      from public.normativa n join public.descarga_normativa_dia d on d.normativa_id = n.id where n.titulo = 'DX Contar'$$,
  array[true], 'el dia guardado es hoy en hora de Argentina');
select results_eq(
  $$select n.descargas, d.descargas, d.dia = (now() at time zone 'America/Argentina/Buenos_Aires')::date,
           (select count(*)::int from public.descarga_normativa_dia where normativa_id = n.id)
      from public.normativa n join public.descarga_normativa_dia d on d.normativa_id = n.id where n.titulo = 'DX Dia'$$,
  $$values (2, 2, true, 1)$$,
  'la zona de la sesion no cambia el dia: sigue siendo la fecha de Argentina, una sola fila con 2');
select results_eq(
  $$select count(*)::int from public.descarga_normativa_dia$$,
  array[6], 'solo existen las 4 filas de DN A y las de DX Contar y DX Dia: el id inexistente no deja nada');
select results_eq(
  $$select count(*)::int from public.registro_operacion where tabla = 'normativa' and operacion = 'UPDATE'
      and registro_id in (select id::text from public.normativa where titulo in ('DX Contar', 'DX Dia'))$$,
  array[0], 'contar no audita ni deja filas en registro_operacion');

-- authenticated sin la marca de admin ---------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"99999999-9999-9999-9999-999999999999","app_metadata":{}}';
select results_eq($$select count(*)::int from public.descarga_normativa_dia$$, array[0],
  'sin marca: no lee filas de la tabla (RLS)');
select throws_ok(
  $$insert into public.descarga_normativa_dia (normativa_id, dia) select id, current_date from public.normativa limit 1$$,
  '42501', null, 'sin marca: INSERT en la tabla da 42501');
select throws_ok($$update public.descarga_normativa_dia set descargas = 99$$, '42501', null, 'sin marca: UPDATE en la tabla da 42501');
select throws_ok($$delete from public.descarga_normativa_dia$$, '42501', null, 'sin marca: DELETE en la tabla da 42501');
select throws_ok(
  $$select * from public.metricas_normativas('2026-03-10', '2026-03-12')$$,
  '42501', null, 'sin marca: metricas_normativas da 42501');
select throws_ok(
  $$select * from public.metricas_normativas(null::date, null::date)$$,
  '42501', null, 'sin marca: el 42501 va antes que la validacion del periodo');
select lives_ok($$select public.contar_descarga_normativa((select id from public.normativa where titulo = 'DX Contar'))$$,
  'sin marca: contar_descarga_normativa funciona (cuenta como cualquier visitante)');

-- admin ------------------------------------------------------------------------------------------
set local request.jwt.claims =
  '{"role":"authenticated","sub":"99999999-9999-9999-9999-999999999999","app_metadata":{"admin":true}}';
select results_eq(
  $$select count(*)::int from public.descarga_normativa_dia$$,
  array[6], 'admin: lee todas las filas de la tabla');
select results_eq(
  $$select d.descargas from public.descarga_normativa_dia d join public.normativa n on n.id = d.normativa_id
     where n.titulo = 'DX Contar'$$,
  array[4], 'admin: ve el conteo del dia de DX Contar en 4 (3 anonimas y 1 sin marca)');
select throws_ok(
  $$insert into public.descarga_normativa_dia (normativa_id, dia) select id, current_date from public.normativa limit 1$$,
  '42501', null, 'admin: INSERT en la tabla da 42501');
select throws_ok($$update public.descarga_normativa_dia set descargas = 99$$, '42501', null, 'admin: UPDATE en la tabla da 42501');
select throws_ok($$delete from public.descarga_normativa_dia$$, '42501', null, 'admin: DELETE en la tabla da 42501');

-- criterio 2: el admin no cuenta
select lives_ok($$select public.contar_descarga_normativa((select id from public.normativa where titulo = 'DX Contar'))$$,
  'admin: contar_descarga_normativa no falla');
select results_eq(
  $$select n.descargas, d.descargas, (select count(*)::int from public.descarga_normativa_dia)
      from public.normativa n join public.descarga_normativa_dia d on d.normativa_id = n.id where n.titulo = 'DX Contar'$$,
  $$values (4, 4, 6)$$,
  'admin: no cambia el contador ni el conteo del dia ni crea filas');

-- metricas_normativas: contrato y valores -------------------------------------------------------------
select results_eq(
  $$select pg_get_function_identity_arguments(oid)::text collate "default", pg_get_function_result(oid)::text collate "default"
      from pg_proc where pronamespace = 'public'::regnamespace and proname = 'metricas_normativas'$$,
  $$values ('p_desde date, p_hasta date'::text,
            'TABLE(id integer, titulo character varying, numero character varying, anio smallint, descargas integer, descargas_periodo bigint)'::text)$$,
  'metricas_normativas: parametros y columnas del contrato (tipos de normativa, descargas_periodo bigint)');
select results_eq(
  $$select array_to_string(proargnames, ',')::text collate "default" from pg_proc
     where pronamespace = 'public'::regnamespace and proname = 'metricas_normativas'$$,
  $$values ('p_desde,p_hasta,id,titulo,numero,anio,descargas,descargas_periodo'::text)$$,
  'metricas_normativas: nombres de parametros y columnas');
select results_eq(
  $$select count(*)::int from public.metricas_normativas('2026-03-10', '2026-03-12')$$,
  $$select count(*)::int from public.normativa$$,
  'metricas_normativas: una fila por normativa (tambien las que no tienen descargas)');
select results_eq(
  $$select count(*)::int from public.metricas_normativas('2026-03-10', '2026-03-12') m
     join public.normativa n on n.id = m.id
    where m.titulo = n.titulo and m.numero = n.numero and m.anio = n.anio and m.descargas = n.descargas$$,
  $$select count(*)::int from public.normativa$$,
  'metricas_normativas: id, titulo, numero, anio y descargas (total historico) son los de la normativa');
select results_eq(
  $$select titulo::text, descargas, descargas_periodo from public.metricas_normativas('2026-03-10', '2026-03-12')
     where titulo like 'DN %' order by titulo$$,
  $$values ('DN A'::text, 10, 5::bigint), ('DN B', 5, 0), ('DN C', 0, 0)$$,
  'metricas_normativas: suma los dias dentro del periodo (10 y 12), deja afuera el 9 y el 13 y muestra ceros');
select results_eq(
  $$select descargas_periodo from public.metricas_normativas('2026-03-10', '2026-03-10') where titulo = 'DN A'$$,
  array[2::bigint], 'metricas_normativas: el dia desde entra (inclusivo)');
select results_eq(
  $$select descargas_periodo from public.metricas_normativas('2026-03-12', '2026-03-12') where titulo = 'DN A'$$,
  array[3::bigint], 'metricas_normativas: el dia hasta entra (inclusivo)');
select results_eq(
  $$select descargas_periodo from public.metricas_normativas('2026-03-09', '2026-03-09') where titulo = 'DN A'$$,
  array[1::bigint], 'metricas_normativas: un periodo de un solo dia anterior suma solo ese dia');
select results_eq(
  $$select descargas_periodo from public.metricas_normativas('2026-03-11', '2026-03-11') where titulo = 'DN A'$$,
  array[0::bigint], 'metricas_normativas: un dia sin conteo da 0');
select results_eq(
  $$select descargas_periodo from public.metricas_normativas('2026-03-01', '2026-03-31') where titulo = 'DN A'$$,
  array[10::bigint], 'metricas_normativas: el mes completo suma todos los dias');
select results_eq(
  $$select count(*)::int from public.metricas_normativas('2026-03-10', '2026-03-12') where titulo = 'DN Borrar'$$,
  array[0], 'metricas_normativas: una normativa borrada ya no aparece');
select results_eq(
  $$select titulo::text, descargas, descargas_periodo
      from public.metricas_normativas((now() at time zone 'America/Argentina/Buenos_Aires')::date,
                                      (now() at time zone 'America/Argentina/Buenos_Aires')::date)
     where titulo like 'DX %' order by titulo$$,
  $$values ('DX Contar'::text, 4, 4::bigint), ('DX Dia', 2, 2)$$,
  'metricas_normativas: las descargas de hoy (Argentina) entran en el periodo hoy-hoy');
select lives_ok(
  $$select * from public.metricas_normativas('2020-01-01', '2020-01-01')$$,
  'metricas_normativas: el tope inferior 2020-01-01 es valido');

-- admin con periodo invalido -> 22023
select throws_ok($$select * from public.metricas_normativas(null::date, '2026-03-12')$$,
  '22023', null, 'metricas_normativas: desde nulo da 22023');
select throws_ok($$select * from public.metricas_normativas('2026-03-10', null::date)$$,
  '22023', null, 'metricas_normativas: hasta nulo da 22023');
select throws_ok($$select * from public.metricas_normativas('2026-03-12', '2026-03-10')$$,
  '22023', null, 'metricas_normativas: desde mayor que hasta da 22023');
select throws_ok($$select * from public.metricas_normativas('2019-12-31', '2020-01-05')$$,
  '22023', null, 'metricas_normativas: desde anterior a 2020-01-01 da 22023');
select throws_ok(
  $$select * from public.metricas_normativas('2026-03-10', (now() at time zone 'America/Argentina/Buenos_Aires')::date + 1)$$,
  '22023', null, 'metricas_normativas: hasta posterior a hoy (fecha local) da 22023');

reset role;
select * from finish();
rollback;
