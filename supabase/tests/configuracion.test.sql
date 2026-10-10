-- Fase B (criterio 8): tabla public.configuracion, RLS, CHECK, auditoria y updated_at.
-- No depende del seed: el usuario de prueba se crea dentro de la transaccion (rollback al final).
-- La fila id = 1 la inserta la migracion de configuracion.
--
-- Notas de diseno del test:
-- - El INSERT de un rol de la API da 42501 (la RLS se evalua antes que el CHECK); el CHECK (id = 1)
--   se prueba como postgres, dueno de la tabla, que saltea la RLS: 23514. Un UPDATE del admin que
--   cambia id a 2 pasa la RLS y lo frena el CHECK: 23514.
-- - UPDATE y DELETE sin permiso no dan error: afectan 0 filas. Se ejecutan sueltos y se verifica el
--   valor resultante (mision sigue en 'base') y que la fila id = 1 sigue existiendo.
-- - updated_at: now() es constante dentro de la transaccion. La migracion corrio en otra transaccion,
--   antes; por eso se guarda el valor inicial en una tabla temporal y, tras un UPDATE, debe ser mayor.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Estructura y fila inicial
select has_table('public', 'configuracion', 'existe public.configuracion');
select results_eq($$select count(*)::int from public.configuracion$$, array[1],
  'la tabla tiene exactamente una fila');
select results_eq($$select id::int, nombre::text from public.configuracion$$,
  $$values (1, 'Ministerio de Educación de Misiones'::text)$$,
  'la fila es id = 1 con el nombre institucional');
select results_eq(
  $$select relrowsecurity from pg_class where oid = to_regclass('public.configuracion')$$,
  array[true], 'configuracion tiene RLS habilitado');

-- Soporte del test (como postgres)
create temp table zz_base as select updated_at from public.configuracion where id = 1;
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
        'authenticated', 'authenticated', 'config-admin@test.local');

-- updated_at avanza solo despues de un UPDATE
update public.configuracion set mision = 'base' where id = 1;
select results_eq(
  $$select c.updated_at > b.updated_at from public.configuracion c, zz_base b where c.id = 1$$,
  array[true], 'updated_at se actualiza solo despues de un UPDATE');

-- Constraints (como postgres, que saltea la RLS)
select throws_ok($$update public.configuracion set nombre = '' where id = 1$$,
  '23514', null, 'nombre vacio es rechazado');
select throws_ok($$update public.configuracion set nombre = '   ' where id = 1$$,
  '23514', null, 'nombre solo con espacios es rechazado');
select throws_ok($$insert into public.configuracion (id, nombre) values (2, 'otra')$$,
  '23514', null, 'CHECK (id = 1): como postgres, insertar id = 2 da 23514');

-- Ningun rol de la API puede ejecutar la funcion del trigger (CREATE TRIGGER la usaria)
select is_empty(
  $$select r from unnest(array['anon', 'authenticated', 'service_role']) as r
    where has_function_privilege(r, 'public.tocar_updated_at()', 'execute')$$,
  'anon, authenticated y service_role no tienen EXECUTE sobre tocar_updated_at()');

-- anon
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select results_eq($$select nombre::text from public.configuracion where id = 1$$,
  array['Ministerio de Educación de Misiones'], 'anon: SELECT devuelve la fila');
update public.configuracion set mision = 'hack' where id = 1;
select throws_ok($$insert into public.configuracion (id, nombre) values (2, 'x')$$,
  '42501', null, 'anon: INSERT da 42501');
delete from public.configuracion;
reset role;
select results_eq($$select mision::text from public.configuracion where id = 1$$, array['base'],
  'anon: UPDATE no cambia el valor');
select results_eq($$select count(*)::int from public.configuracion where id = 1$$, array[1],
  'anon: DELETE deja la fila id = 1');

-- authenticated sin marca de admin
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"22222222-2222-2222-2222-222222222222","app_metadata":{}}';
select results_eq($$select nombre::text from public.configuracion where id = 1$$,
  array['Ministerio de Educación de Misiones'], 'sin marca: SELECT devuelve la fila');
update public.configuracion set mision = 'hack' where id = 1;
select throws_ok($$insert into public.configuracion (id, nombre) values (2, 'x')$$,
  '42501', null, 'sin marca: INSERT da 42501');
delete from public.configuracion;
reset role;
select results_eq($$select mision::text from public.configuracion where id = 1$$, array['base'],
  'sin marca: UPDATE no cambia el valor');
select results_eq($$select count(*)::int from public.configuracion where id = 1$$, array[1],
  'sin marca: DELETE deja la fila id = 1');

-- admin
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"22222222-2222-2222-2222-222222222222","app_metadata":{"admin":true}}';
update public.configuracion set mision = 'nueva mision' where id = 1;
select throws_ok($$insert into public.configuracion (id, nombre) values (2, 'x')$$,
  '42501', null, 'admin: INSERT da 42501');
select throws_ok($$update public.configuracion set id = 2 where id = 1$$,
  '23514', null, 'admin: UPDATE que cambia id a 2 da 23514 (CHECK id = 1)');
delete from public.configuracion;
reset role;
select results_eq($$select count(*)::int from public.configuracion where id = 1$$, array[1],
  'admin: DELETE deja la fila id = 1');
select results_eq($$select mision::text from public.configuracion where id = 1$$,
  array['nueva mision'], 'admin: UPDATE cambia el valor');
select results_eq(
  $$select count(*)::int from public.registro_operacion
    where tabla = 'configuracion' and operacion = 'UPDATE' and registro_id = '1'
      and usuario_id = '22222222-2222-2222-2222-222222222222'$$,
  array[1], 'el UPDATE del admin queda en registro_operacion con su usuario_id');

select * from finish();
rollback;
