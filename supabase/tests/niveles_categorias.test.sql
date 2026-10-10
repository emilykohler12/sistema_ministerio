-- Corte niveles-categorias (criterios 1, 3, 4, 5, 6 y 7): nivel_educativo y categoria.
-- No depende del seed: el usuario de prueba se crea dentro de la transaccion (rollback al final).
--
-- Notas de diseno del test:
-- - UPDATE y DELETE sin permiso no dan error: afectan 0 filas. Se ejecutan sueltos y se verifica el
--   valor resultante como postgres. El INSERT sin permiso da 42501.
-- - updated_at: now() es constante dentro de la transaccion. Por eso la fila 'Activa A' se inserta
--   con updated_at en el pasado y, tras un UPDATE, debe ser mayor.
-- - Las categorias de soporte se insertan como postgres (saltea la RLS). Se asume la tabla vacia al
--   empezar (la migracion no siembra categorias).
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- (RLS habilitado en las dos tablas: lo verifica la guardia rls_global.)

-- Los 5 niveles de 0008, filas exactas (la constante NIVELES del frontend debe coincidir)
select results_eq(
  $$select id::int, nombre::text, orden::int from public.nivel_educativo order by id$$,
  $$values (1, 'Inicial'::text, 1), (2, 'Primario'::text, 2), (3, 'Secundario'::text, 3),
           (4, 'Terciario'::text, 4), (5, 'Formación profesional'::text, 5)$$,
  'nivel_educativo tiene las 5 filas exactas de 0008');

-- Soporte del test (como postgres)
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
        'authenticated', 'authenticated', 'cat-admin@test.local');
insert into public.categoria (nivel_id, nombre, descripcion, activo, created_at, updated_at)
values (1, 'Activa A', 'base', true, '2020-01-01', '2020-01-01'),
       (1, 'Inactiva B', 'base', false, '2020-01-01', '2020-01-01');

-- updated_at se actualiza solo
update public.categoria set descripcion = 'cambiada' where nombre = 'Activa A';
select results_eq(
  $$select updated_at > '2020-01-02'::timestamptz from public.categoria where nombre = 'Activa A'$$,
  array[true], 'categoria: updated_at se actualiza solo despues de un UPDATE');
update public.categoria set descripcion = 'base' where nombre = 'Activa A';

-- Ningun rol de la API modifica los niveles ni ve categorias de mas: anon
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select results_eq($$select count(*)::int from public.nivel_educativo$$, array[5],
  'anon: SELECT en nivel_educativo devuelve los 5 niveles');
select throws_ok(
  $$insert into public.nivel_educativo (id, nombre, orden) values (6, 'Otro', 6)$$,
  '42501', null, 'anon: INSERT en nivel_educativo da 42501');
select results_eq($$select nombre::text from public.categoria order by nombre$$,
  array['Activa A'], 'anon: ve solo las categorias activas');
select throws_ok(
  $$insert into public.categoria (nivel_id, nombre) values (1, 'Hack')$$,
  '42501', null, 'anon: INSERT en categoria da 42501');
update public.categoria set descripcion = 'hack';
delete from public.categoria;
reset role;
select results_eq(
  $$select count(*)::int from public.categoria where descripcion = 'hack'$$, array[0],
  'anon: UPDATE en categoria no cambia nada');
select results_eq($$select count(*)::int from public.categoria$$, array[2],
  'anon: DELETE en categoria no borra nada');

-- authenticated sin marca de admin
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"33333333-3333-3333-3333-333333333333","app_metadata":{}}';
select results_eq($$select nombre::text from public.categoria order by nombre$$,
  array['Activa A'], 'sin marca: ve solo las categorias activas');
select throws_ok(
  $$insert into public.categoria (nivel_id, nombre) values (1, 'Hack')$$,
  '42501', null, 'sin marca: INSERT en categoria da 42501');
update public.categoria set descripcion = 'hack';
delete from public.categoria;
reset role;
select results_eq(
  $$select count(*)::int from public.categoria where descripcion = 'hack'$$, array[0],
  'sin marca: UPDATE en categoria no cambia nada');
select results_eq($$select count(*)::int from public.categoria$$, array[2],
  'sin marca: DELETE en categoria no borra nada');

-- admin
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"33333333-3333-3333-3333-333333333333","app_metadata":{"admin":true}}';
select results_eq($$select nombre::text from public.categoria order by nombre$$,
  array['Activa A', 'Inactiva B'], 'admin: ve todas las categorias, tambien las inactivas');
select throws_ok(
  $$insert into public.nivel_educativo (id, nombre, orden) values (6, 'Otro', 6)$$,
  '42501', null, 'admin: INSERT en nivel_educativo da 42501');
update public.nivel_educativo set nombre = 'Hack' where id = 1;
delete from public.nivel_educativo;
select lives_ok(
  $$insert into public.categoria (nivel_id, nombre, descripcion) values (1, 'Salud', 'sana')$$,
  'admin: INSERT en categoria funciona');
select lives_ok(
  $$update public.categoria set descripcion = 'editada' where nombre = 'Salud'$$,
  'admin: UPDATE en categoria funciona');
update public.categoria set activo = false where nombre = 'Salud';
update public.categoria set activo = true where nombre = 'Salud';
delete from public.categoria;
reset role;
select results_eq($$select nombre::text from public.nivel_educativo where id = 1$$,
  array['Inicial'], 'admin: UPDATE en nivel_educativo no tiene efecto');
select results_eq($$select count(*)::int from public.nivel_educativo$$, array[5],
  'admin: DELETE en nivel_educativo no tiene efecto');
select results_eq($$select count(*)::int from public.categoria$$, array[3],
  'admin: DELETE en categoria no tiene efecto');
select results_eq($$select descripcion::text from public.categoria where nombre = 'Salud'$$,
  array['editada'], 'admin: UPDATE en categoria cambia el valor');
select results_eq(
  $$select count(*)::int from public.registro_operacion
    where tabla = 'categoria' and operacion = 'INSERT'
      and registro_id = (select id::text from public.categoria where nombre = 'Salud')
      and usuario_id = '33333333-3333-3333-3333-333333333333'$$,
  array[1], 'el INSERT del admin queda en registro_operacion con su usuario_id');
select results_eq(
  $$select count(*)::int from public.registro_operacion
    where tabla = 'categoria' and operacion = 'UPDATE'
      and registro_id = (select id::text from public.categoria where nombre = 'Salud')
      and usuario_id = '33333333-3333-3333-3333-333333333333'$$,
  array[3], 'los UPDATE del admin quedan en registro_operacion con su usuario_id');

-- Duplicados normalizados en el mismo nivel (como admin)
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"33333333-3333-3333-3333-333333333333","app_metadata":{"admin":true}}';
select throws_ok(
  $$insert into public.categoria (nivel_id, nombre) values (1, 'salud')$$,
  '23505', null, 'duplicado por mayusculas en el mismo nivel da 23505');
select throws_ok(
  $$insert into public.categoria (nivel_id, nombre) values (1, 'Salúd')$$,
  '23505', null, 'duplicado por tildes en el mismo nivel da 23505');
select throws_ok(
  $$insert into public.categoria (nivel_id, nombre) values (1, '  Salud ')$$,
  '23505', null, 'duplicado por espacios en los bordes da 23505');
select throws_ok(
  $$insert into public.categoria (nivel_id, nombre) values (1, 'inactiva b')$$,
  '23505', null, 'duplicado contra una categoria inactiva da 23505');
select throws_ok(
  $$update public.categoria set nombre = 'salud ' where nombre = 'Activa A'$$,
  '23505', null, 'duplicado por UPDATE (con espacios) da 23505');
select throws_ok(
  $$update public.categoria set nombre = 'INACTIVA B' where nombre = 'Activa A'$$,
  '23505', null, 'duplicado por UPDATE contra una categoria inactiva da 23505');
select lives_ok(
  $$insert into public.categoria (nivel_id, nombre) values (2, 'Salud')$$,
  'el mismo nombre en otro nivel pasa');

-- Constraints
select throws_ok(
  $$insert into public.categoria (nivel_id, nombre) values (1, '   ')$$,
  '23514', null, 'nombre en blanco da 23514');
select throws_ok(
  $$update public.categoria set nombre = '' where nombre = 'Activa A'$$,
  '23514', null, 'UPDATE a nombre vacio da 23514');
select throws_ok(
  $$insert into public.categoria (nivel_id, nombre) values (99, 'Huerfana')$$,
  '23503', null, 'nivel_id inexistente da 23503');
reset role;

select * from finish();
rollback;
