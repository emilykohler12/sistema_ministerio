-- Corte talleres (criterios 1, 2, 4, 6 y 7): taller, destinatario, etiqueta, puentes y guardar_taller().
-- No depende del seed: el usuario de prueba se crea dentro de la transaccion (rollback al final).
--
-- Notas de diseno del test:
-- - UPDATE y DELETE sin permiso no dan error: afectan 0 filas. Se ejecutan sueltos y se verifica el
--   valor resultante como postgres. El INSERT sin permiso da 42501.
-- - updated_at: now() es constante dentro de la transaccion. Por eso el taller 'T Pub' se inserta
--   con updated_at en el pasado y, tras un UPDATE, debe ser mayor.
-- - Se asume que no hay categorias, talleres ni etiquetas al empezar (las migraciones no siembran datos
--   de dominio salvo niveles y destinatarios).
-- - El detail de DA001 se captura en un bloque DO (pgTAP no lo expone) y se pasa con set_config.
-- - throws_ok corre en un subbloque con rollback: lo que falla no deja filas, y asi se prueba la atomicidad.
begin;
create extension if not exists pgtap with schema extensions;
select plan(83);

-- Soporte del test (como postgres)
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444',
        'authenticated', 'authenticated', 'taller-admin@test.local');

insert into public.categoria (nivel_id, nombre, descripcion, activo) values
  (1, 'Activa', 'base', true),
  (1, 'Inactiva', 'base', false),
  (1, 'Otra activa', 'base', true),
  (1, 'Con inactivo', 'base', true),
  (1, 'Vacia', 'base', true);

-- Un INACTIVO puede existir en una categoria inactiva (el invariante solo prohibe BORRADOR y PUBLICADO)
insert into public.taller (categoria_id, nombre, descripcion, estado, created_at, updated_at) values
  ((select id from public.categoria where nombre = 'Activa'), 'T Pub', 'd', 'PUBLICADO', '2020-01-01', '2020-01-01'),
  ((select id from public.categoria where nombre = 'Activa'), 'T Bor', 'd', 'BORRADOR', '2020-01-01', '2020-01-01'),
  ((select id from public.categoria where nombre = 'Activa'), 'T Ina', 'd', 'INACTIVO', '2020-01-01', '2020-01-01'),
  ((select id from public.categoria where nombre = 'Inactiva'), 'T Ina en inactiva', 'd', 'INACTIVO', '2020-01-01', '2020-01-01'),
  ((select id from public.categoria where nombre = 'Con inactivo'), 'T Solo inactivo', 'd', 'INACTIVO', '2020-01-01', '2020-01-01');

insert into public.etiqueta (nombre) values ('Base'), ('SoloBorrador');
insert into public.taller_destinatario (taller_id, destinatario_id) values
  ((select id from public.taller where nombre = 'T Pub'), 1),
  ((select id from public.taller where nombre = 'T Bor'), 1);
insert into public.taller_etiqueta (taller_id, etiqueta_id) values
  ((select id from public.taller where nombre = 'T Pub'), (select id from public.etiqueta where nombre = 'Base')),
  ((select id from public.taller where nombre = 'T Bor'), (select id from public.etiqueta where nombre = 'Base')),
  ((select id from public.taller where nombre = 'T Bor'), (select id from public.etiqueta where nombre = 'SoloBorrador'));

-- (RLS habilitado y trigger auditar() en las cinco tablas: lo verifican las guardias globales.)

-- updated_at se actualiza solo
update public.taller set descripcion = 'cambiada' where nombre = 'T Pub';
select results_eq(
  $$select updated_at > '2020-01-02'::timestamptz from public.taller where nombre = 'T Pub'$$,
  array[true], 'taller: updated_at se actualiza solo despues de un UPDATE');
update public.taller set descripcion = 'd' where nombre = 'T Pub';

-- destinatario: 5 filas exactas (la constante DESTINATARIOS del frontend debe coincidir)
select results_eq(
  $$select id::int, nombre::text from public.destinatario order by id$$,
  $$values (1, 'Directivos'::text), (2, 'Familias'::text), (3, 'Estudiantes'::text),
           (4, 'Docentes'::text), (5, 'Comunidad educativa'::text)$$,
  'destinatario tiene las 5 filas exactas');

-- Permisos de EXECUTE de guardar_taller: solo authenticated
select ok(
  has_function_privilege('authenticated',
    'public.guardar_taller(int, text, text, public.estado_taller, smallint[], text[], int)', 'execute'),
  'guardar_taller: authenticated tiene EXECUTE');
select ok(
  not has_function_privilege('anon',
    'public.guardar_taller(int, text, text, public.estado_taller, smallint[], text[], int)', 'execute'),
  'guardar_taller: anon no tiene EXECUTE');
-- (has_function_privilege de anon ya incluye lo que se otorga a PUBLIC: si PUBLIC conservara EXECUTE, fallaria.)

-- Las funciones de trigger no las ejecuta directamente ningun rol de la API
select is_empty(
  $$select r || ' ' || f
      from unnest(array['anon', 'authenticated', 'service_role']) as r,
           unnest(array['public.taller_validar_categoria()', 'public.categoria_validar_baja()']) as f
     where has_function_privilege(r, f, 'execute')$$,
  'anon, authenticated y service_role no tienen EXECUTE sobre las funciones de trigger de talleres');

-- anon ------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select results_eq($$select nombre::text from public.taller order by nombre$$,
  array['T Pub'], 'anon: ve solo los talleres publicados');
select results_eq($$select count(*)::int from public.taller_destinatario$$, array[1],
  'anon: ve solo las filas de taller_destinatario de talleres publicados');
select results_eq($$select count(*)::int from public.taller_etiqueta$$, array[1],
  'anon: ve solo las filas de taller_etiqueta de talleres publicados');
select results_eq($$select count(*)::int from public.destinatario$$, array[5],
  'anon: SELECT en destinatario devuelve las 5 filas');
select results_eq($$select count(*)::int from public.etiqueta$$, array[2],
  'anon: SELECT en etiqueta es publico, tambien la que solo usa un BORRADOR');
select throws_ok(
  $$insert into public.taller (categoria_id, nombre, descripcion)
    values ((select id from public.categoria where nombre = 'Activa'), 'Hack', 'x')$$,
  '42501', null, 'anon: INSERT en taller da 42501');
select throws_ok(
  $$insert into public.etiqueta (nombre) values ('Hack')$$,
  '42501', null, 'anon: INSERT en etiqueta da 42501');
select throws_ok(
  $$insert into public.taller_destinatario (taller_id, destinatario_id)
    values ((select id from public.taller where nombre = 'T Pub'), 2)$$,
  '42501', null, 'anon: INSERT en taller_destinatario da 42501');
select throws_ok(
  $$insert into public.taller_etiqueta (taller_id, etiqueta_id)
    values ((select id from public.taller where nombre = 'T Pub'), (select id from public.etiqueta limit 1))$$,
  '42501', null, 'anon: INSERT en taller_etiqueta da 42501');
update public.taller set descripcion = 'hack';
delete from public.taller;
reset role;
select results_eq($$select count(*)::int from public.taller where descripcion = 'hack'$$, array[0],
  'anon: UPDATE en taller no cambia nada');
select results_eq($$select count(*)::int from public.taller$$, array[5],
  'anon: DELETE en taller no borra nada');

-- authenticated sin marca de admin --------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"44444444-4444-4444-4444-444444444444","app_metadata":{}}';
select results_eq($$select nombre::text from public.taller order by nombre$$,
  array['T Pub'], 'sin marca: ve solo los talleres publicados');
select results_eq($$select count(*)::int from public.taller_destinatario$$, array[1],
  'sin marca: ve solo las filas de taller_destinatario de talleres publicados');
select results_eq($$select count(*)::int from public.taller_etiqueta$$, array[1],
  'sin marca: ve solo las filas de taller_etiqueta de talleres publicados');
select throws_ok(
  $$insert into public.taller (categoria_id, nombre, descripcion)
    values ((select id from public.categoria where nombre = 'Activa'), 'Hack', 'x')$$,
  '42501', null, 'sin marca: INSERT en taller da 42501');
select throws_ok(
  $$insert into public.etiqueta (nombre) values ('Hack')$$,
  '42501', null, 'sin marca: INSERT en etiqueta da 42501');
select throws_ok(
  $$insert into public.taller_destinatario (taller_id, destinatario_id)
    values ((select id from public.taller where nombre = 'T Pub'), 2)$$,
  '42501', null, 'sin marca: INSERT en taller_destinatario da 42501');
select throws_ok(
  $$insert into public.taller_etiqueta (taller_id, etiqueta_id)
    values ((select id from public.taller where nombre = 'T Pub'), (select id from public.etiqueta limit 1))$$,
  '42501', null, 'sin marca: INSERT en taller_etiqueta da 42501');
update public.taller set descripcion = 'hack';
delete from public.taller;
reset role;
select results_eq($$select count(*)::int from public.taller where descripcion = 'hack'$$, array[0],
  'sin marca: UPDATE en taller no cambia nada');
select results_eq($$select count(*)::int from public.taller$$, array[5],
  'sin marca: DELETE en taller no borra nada');

-- admin: visibilidad y cierres ------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"44444444-4444-4444-4444-444444444444","app_metadata":{"admin":true}}';
select results_eq($$select nombre::text from public.taller order by nombre$$,
  array['T Bor', 'T Ina', 'T Ina en inactiva', 'T Pub', 'T Solo inactivo'],
  'admin: ve todos los talleres, tambien borradores e inactivos');
select results_eq($$select count(*)::int from public.taller_destinatario$$, array[2],
  'admin: ve todas las filas de taller_destinatario');
select results_eq($$select count(*)::int from public.taller_etiqueta$$, array[3],
  'admin: ve todas las filas de taller_etiqueta');
select throws_ok(
  $$insert into public.destinatario (id, nombre) values (6, 'Otros')$$,
  '42501', null, 'admin: INSERT en destinatario da 42501');
update public.destinatario set nombre = 'Hack' where id = 1;
delete from public.destinatario;
delete from public.taller;
reset role;
select results_eq($$select nombre::text from public.destinatario where id = 1$$,
  array['Directivos'], 'admin: UPDATE en destinatario no tiene efecto');
select results_eq($$select count(*)::int from public.destinatario$$, array[5],
  'admin: DELETE en destinatario no tiene efecto');
select results_eq($$select count(*)::int from public.taller$$, array[5],
  'admin: DELETE en taller no tiene efecto');

-- Etiquetas duplicadas normalizadas (como admin) ------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"44444444-4444-4444-4444-444444444444","app_metadata":{"admin":true}}';
select lives_ok($$insert into public.etiqueta (nombre) values ('Unica')$$,
  'admin: INSERT en etiqueta funciona');
select throws_ok($$insert into public.etiqueta (nombre) values ('UNICA')$$,
  '23505', null, 'etiqueta duplicada por mayusculas da 23505');
select throws_ok($$insert into public.etiqueta (nombre) values ('Únicá')$$,
  '23505', null, 'etiqueta duplicada por tildes da 23505');
select throws_ok($$insert into public.etiqueta (nombre) values ('  unica ')$$,
  '23505', null, 'etiqueta duplicada por espacios en los bordes da 23505');
select throws_ok($$insert into public.etiqueta (nombre) values ('   ')$$,
  '23514', null, 'etiqueta en blanco da 23514');

-- Constraints de taller
select throws_ok(
  $$insert into public.taller (categoria_id, nombre, descripcion)
    values ((select id from public.categoria where nombre = 'Activa'), '   ', 'x')$$,
  '23514', null, 'taller con nombre en blanco da 23514');
select throws_ok(
  $$insert into public.taller (categoria_id, nombre, descripcion)
    values ((select id from public.categoria where nombre = 'Activa'), 'Sin desc', '  ')$$,
  '23514', null, 'taller con descripcion en blanco da 23514');
select results_eq(
  $$with t as (insert into public.taller (categoria_id, nombre, descripcion)
               values ((select id from public.categoria where nombre = 'Activa'), 'Por defecto', 'x')
               returning estado)
    select estado::text from t$$,
  array['BORRADOR'], 'taller: el estado por defecto es BORRADOR');

-- DA001: dar de baja una categoria con talleres no inactivos ------------------
-- 'Activa' tiene 3 talleres no inactivos: T Pub, T Bor y 'Por defecto' (T Ina no cuenta).
do $$
begin
  begin
    update public.categoria set activo = false where nombre = 'Activa';
    perform set_config('test.da001_estado', 'sin error', true);
  exception when others then
    declare
      v_detail text;
    begin
      get stacked diagnostics v_detail = pg_exception_detail;
      perform set_config('test.da001_estado', sqlstate, true);
      perform set_config('test.da001_detail', coalesce(v_detail, ''), true);
    end;
  end;
end $$;
select is(current_setting('test.da001_estado'), 'DA001',
  'dar de baja una categoria con talleres no inactivos da DA001');
select is(current_setting('test.da001_detail'), '3',
  'DA001 informa en details la cantidad de talleres no inactivos');
select lives_ok(
  $$update public.categoria set activo = false where nombre = 'Con inactivo'$$,
  'dar de baja una categoria que solo tiene talleres inactivos pasa');
select lives_ok(
  $$update public.categoria set activo = false where nombre = 'Vacia'$$,
  'dar de baja una categoria sin talleres pasa');

-- DA002: el invariante "categoria inactiva solo tiene talleres inactivos" -----
select throws_ok(
  $$insert into public.taller (categoria_id, nombre, descripcion, estado)
    values ((select id from public.categoria where nombre = 'Inactiva'), 'Nuevo bor', 'x', 'BORRADOR')$$,
  'DA002', null, 'crear un BORRADOR en una categoria inactiva da DA002');
select throws_ok(
  $$insert into public.taller (categoria_id, nombre, descripcion, estado)
    values ((select id from public.categoria where nombre = 'Inactiva'), 'Nuevo pub', 'x', 'PUBLICADO')$$,
  'DA002', null, 'crear un PUBLICADO en una categoria inactiva da DA002');
select lives_ok(
  $$insert into public.taller (categoria_id, nombre, descripcion, estado)
    values ((select id from public.categoria where nombre = 'Inactiva'), 'Nuevo ina', 'x', 'INACTIVO')$$,
  'crear un INACTIVO en una categoria inactiva pasa');
select throws_ok(
  $$update public.taller set estado = 'PUBLICADO' where nombre = 'T Ina en inactiva'$$,
  'DA002', null, 'publicar un taller de una categoria inactiva da DA002');
select throws_ok(
  $$update public.taller set estado = 'BORRADOR' where nombre = 'T Ina en inactiva'$$,
  'DA002', null, 'reactivar (INACTIVO a BORRADOR) un taller de una categoria inactiva da DA002');
select throws_ok(
  $$update public.taller set categoria_id = (select id from public.categoria where nombre = 'Inactiva')
    where nombre = 'T Bor'$$,
  'DA002', null, 'mover un taller BORRADOR a una categoria inactiva da DA002');
select throws_ok(
  $$update public.taller set categoria_id = (select id from public.categoria where nombre = 'Inactiva')
    where nombre = 'T Pub'$$,
  'DA002', null, 'mover un taller PUBLICADO a una categoria inactiva da DA002');
select lives_ok(
  $$update public.taller set categoria_id = (select id from public.categoria where nombre = 'Inactiva')
    where nombre = 'T Ina'$$,
  'mover un taller INACTIVO a una categoria inactiva pasa');
select throws_ok(
  $$select public.guardar_taller((select id from public.categoria where nombre = 'Inactiva'),
      'Via rpc', 'x', 'PUBLICADO', array[1]::smallint[], array['EtiquetaRpcDa002'])$$,
  'DA002', null, 'guardar_taller PUBLICADO en una categoria inactiva da DA002');
select lives_ok(
  $$update public.taller set estado = 'BORRADOR' where nombre = 'T Bor'$$,
  'cambiar el estado de un taller de una categoria activa pasa');

-- categoria.nivel_id queda cerrado, el resto de las columnas editables
select throws_ok(
  $$update public.categoria set nivel_id = 2 where nombre = 'Otra activa'$$,
  '42501', null, 'admin: UPDATE de categoria.nivel_id da 42501');
select lives_ok(
  $$update public.categoria set nombre = 'Otra renombrada', descripcion = 'nueva', activo = true
    where nombre = 'Otra activa'$$,
  'admin: UPDATE de nombre, descripcion y activo en categoria sigue funcionando');

-- guardar_taller: alta, etiquetas sin duplicados ------------------------------
select lives_ok(
  $$select public.guardar_taller((select id from public.categoria where nombre = 'Otra renombrada'),
      'Con redes', 'desc', 'BORRADOR', array[1, 2]::smallint[], array[' Redes ', 'redés', 'REDES'])$$,
  'guardar_taller: alta con etiquetas repetidas (mayusculas, tildes, espacios) funciona');
reset role;
select results_eq(
  $$select nombre::text from public.etiqueta
    where lower(public.inmutable_unaccent(btrim(nombre))) = 'redes'$$,
  array['Redes'], 'guardar_taller deja una sola etiqueta, con el nombre recortado ''Redes''');
select results_eq(
  $$select count(*)::int from public.taller_etiqueta
    where taller_id = (select id from public.taller where nombre = 'Con redes')$$,
  array[1], 'guardar_taller deja una sola fila puente para las etiquetas repetidas');
select results_eq(
  $$select destinatario_id::int from public.taller_destinatario
    where taller_id = (select id from public.taller where nombre = 'Con redes') order by 1$$,
  array[1, 2], 'guardar_taller guarda los destinatarios del alta');
select results_eq(
  $$select categoria_id = (select id from public.categoria where nombre = 'Otra renombrada'),
           estado::text, descripcion::text
    from public.taller where nombre = 'Con redes'$$,
  $$values (true, 'BORRADOR'::text, 'desc'::text)$$,
  'guardar_taller guarda categoria, estado y descripcion del alta');

-- guardar_taller: edicion, sincronizacion por diferencia ----------------------
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"44444444-4444-4444-4444-444444444444","app_metadata":{"admin":true}}';
select lives_ok(
  $$select public.guardar_taller((select id from public.categoria where nombre = 'Otra renombrada'),
      'Con redes', 'desc editada', 'PUBLICADO', array[2, 3]::smallint[], array['Redes', 'Nueva'],
      (select id from public.taller where nombre = 'Con redes'))$$,
  'guardar_taller: editar con p_id funciona');
reset role;
select results_eq(
  $$select destinatario_id::int from public.taller_destinatario
    where taller_id = (select id from public.taller where nombre = 'Con redes') order by 1$$,
  array[2, 3], 'editar sincroniza destinatarios: quita el 1 y agrega el 3');
select results_eq(
  $$select e.nombre::text from public.taller_etiqueta te join public.etiqueta e on e.id = te.etiqueta_id
    where te.taller_id = (select id from public.taller where nombre = 'Con redes') order by 1$$,
  array['Nueva', 'Redes'], 'editar sincroniza etiquetas: conserva Redes y agrega Nueva');
select results_eq(
  $$select estado::text, descripcion::text from public.taller where nombre = 'Con redes'$$,
  $$values ('PUBLICADO'::text, 'desc editada'::text)$$,
  'editar actualiza estado y descripcion del taller');
select results_eq(
  $$select count(*)::int from public.etiqueta
    where lower(public.inmutable_unaccent(btrim(nombre))) = 'redes'$$,
  array[1], 'editar reutiliza la etiqueta existente, no la duplica');

-- guardar_taller: edicion que quita elementos (rama del delete por diferencia) -
-- Taller aparte, para no alterar los conteos de auditoria de 'Con redes'.
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"44444444-4444-4444-4444-444444444444","app_metadata":{"admin":true}}';
select lives_ok(
  $$select public.guardar_taller((select id from public.categoria where nombre = 'Otra renombrada'),
      'Para vaciar', 'x', 'BORRADOR', array[1, 2]::smallint[], array['Quitar1', 'Quedar1'])$$,
  'guardar_taller: alta de un taller con dos etiquetas y dos destinatarios');
select lives_ok(
  $$select public.guardar_taller((select id from public.categoria where nombre = 'Otra renombrada'),
      'Para vaciar', 'x', 'BORRADOR', array[2]::smallint[], array['Quedar1'],
      (select id from public.taller where nombre = 'Para vaciar'))$$,
  'guardar_taller: editar quitando una etiqueta y un destinatario');
reset role;
select results_eq(
  $$select e.nombre::text from public.taller_etiqueta te join public.etiqueta e on e.id = te.etiqueta_id
    where te.taller_id = (select id from public.taller where nombre = 'Para vaciar') order by 1$$,
  array['Quedar1'], 'editar quitando una etiqueta borra su fila puente y conserva la otra');
select results_eq(
  $$select destinatario_id::int from public.taller_destinatario
    where taller_id = (select id from public.taller where nombre = 'Para vaciar') order by 1$$,
  array[2], 'editar quitando un destinatario borra su fila puente y conserva el otro');

set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"44444444-4444-4444-4444-444444444444","app_metadata":{"admin":true}}';
select lives_ok(
  $$select public.guardar_taller((select id from public.categoria where nombre = 'Otra renombrada'),
      'Para vaciar', 'x', 'BORRADOR', array[]::smallint[], array[]::text[],
      (select id from public.taller where nombre = 'Para vaciar'))$$,
  'guardar_taller: editar con arrays vacios funciona');
reset role;
select results_eq(
  $$select count(*)::int from public.taller_etiqueta
    where taller_id = (select id from public.taller where nombre = 'Para vaciar')$$,
  array[0], 'editar con etiquetas vacias deja 0 filas puente de etiquetas');
select results_eq(
  $$select count(*)::int from public.taller_destinatario
    where taller_id = (select id from public.taller where nombre = 'Para vaciar')$$,
  array[0], 'editar con destinatarios vacios deja 0 filas puente de destinatarios');

set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"44444444-4444-4444-4444-444444444444","app_metadata":{"admin":true}}';
select throws_ok(
  $$select public.guardar_taller((select id from public.categoria where nombre = 'Otra renombrada'),
      'Fantasma', 'x', 'BORRADOR', array[1]::smallint[], array[]::text[], 999999)$$,
  'P0002', null, 'guardar_taller con p_id inexistente da P0002');

-- Atomicidad: un destinatario inexistente no deja nada a medias
select throws_ok(
  $$select public.guardar_taller((select id from public.categoria where nombre = 'Otra renombrada'),
      'Atomico', 'x', 'BORRADOR', array[1, 99]::smallint[], array['EtiquetaAtomica'])$$,
  '23503', null, 'guardar_taller con un destinatario inexistente da 23503');
select results_eq($$select count(*)::int from public.taller where nombre = 'Atomico'$$, array[0],
  'atomicidad: no queda el taller tras el fallo');
select results_eq($$select count(*)::int from public.etiqueta where nombre = 'EtiquetaAtomica'$$, array[0],
  'atomicidad: no quedan las etiquetas nuevas tras el fallo');

-- Sin marca no puede usar la RPC para escribir
set local request.jwt.claims =
  '{"role":"authenticated","sub":"44444444-4444-4444-4444-444444444444","app_metadata":{}}';
select throws_ok(
  $$select public.guardar_taller((select id from public.categoria where nombre = 'Otra renombrada'),
      'Sin marca', 'x', 'BORRADOR', array[1]::smallint[], array['EtiquetaSinMarca'])$$,
  '42501', null, 'sin marca: guardar_taller da 42501 (la RLS sigue valiendo)');
reset role;

-- anon no puede ejecutar la RPC
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$select public.guardar_taller(1, 'Anon', 'x', 'BORRADOR', array[1]::smallint[], array[]::text[])$$,
  '42501', null, 'anon: guardar_taller da 42501');
reset role;

-- Auditoria con el sub del admin ----------------------------------------------
select results_eq(
  $$select count(*)::int from public.registro_operacion
    where tabla = 'taller' and operacion = 'INSERT'
      and registro_id = (select id::text from public.taller where nombre = 'Con redes')
      and usuario_id = '44444444-4444-4444-4444-444444444444'$$,
  array[1], 'el INSERT de taller del admin queda en registro_operacion con su usuario_id');
select results_eq(
  $$select count(*)::int from public.registro_operacion
    where tabla = 'taller_destinatario' and operacion = 'INSERT'
      and (datos_nuevos ->> 'taller_id') = (select id::text from public.taller where nombre = 'Con redes')
      and usuario_id = '44444444-4444-4444-4444-444444444444'$$,
  array[3], 'las filas puente de destinatarios quedan auditadas con el usuario_id (2 del alta y 1 de la edicion)');
select results_eq(
  $$select count(*)::int from public.registro_operacion
    where tabla = 'taller_destinatario' and operacion = 'DELETE'
      and (datos_anteriores ->> 'taller_id') = (select id::text from public.taller where nombre = 'Con redes')
      and usuario_id = '44444444-4444-4444-4444-444444444444'$$,
  array[1], 'editar borra por diferencia: solo una baja auditada (la fila 2 no se toca)');
select results_eq(
  $$select count(*)::int from public.registro_operacion
    where tabla = 'taller_etiqueta' and operacion = 'INSERT'
      and (datos_nuevos ->> 'taller_id') = (select id::text from public.taller where nombre = 'Con redes')
      and usuario_id = '44444444-4444-4444-4444-444444444444'$$,
  array[2], 'las filas puente de etiquetas quedan auditadas (1 del alta y 1 de la edicion, sin reinsertar Redes)');

select * from finish();
rollback;
