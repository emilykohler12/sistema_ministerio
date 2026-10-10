-- Criterio 6: privilegios de registro_operacion (append-only; SELECT solo admin).
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Estructura
select has_table('public', 'registro_operacion', 'existe public.registro_operacion');
select col_is_null('public', 'registro_operacion', 'usuario_id', 'usuario_id admite NULL (sistema)');
select col_is_null('public', 'registro_operacion', 'registro_id', 'registro_id admite NULL (PK compuesta)');
select fk_ok('public', 'registro_operacion', 'usuario_id', 'auth', 'users', 'id',
  'usuario_id referencia auth.users(id)');
select results_eq(
  $$select relrowsecurity from pg_class where oid = to_regclass('public.registro_operacion')$$,
  array[true], 'registro_operacion tiene RLS habilitado');

-- Privilegios exactos sobre la tabla
select table_privs_are('public', 'registro_operacion', 'anon', array[]::text[],
  'anon sin privilegios');
select table_privs_are('public', 'registro_operacion', 'service_role', array[]::text[],
  'service_role sin privilegios');
select table_privs_are('public', 'registro_operacion', 'authenticated', array['SELECT'],
  'authenticated solo SELECT');

-- Privilegios sobre la secuencia del id
select sequence_privs_are('public', 'registro_operacion_id_seq', 'anon', array[]::text[],
  'anon sin privilegios sobre la secuencia');
select sequence_privs_are('public', 'registro_operacion_id_seq', 'authenticated', array[]::text[],
  'authenticated sin privilegios sobre la secuencia');
select sequence_privs_are('public', 'registro_operacion_id_seq', 'service_role', array[]::text[],
  'service_role sin privilegios sobre la secuencia');

-- Fila de prueba (como postgres, dueno de la tabla)
select lives_ok(
  $$insert into public.registro_operacion (operacion, tabla, registro_id, fecha_hora)
    values ('INSERT', 'tabla_prueba', '1', now())$$,
  'el dueno puede insertar una fila de prueba');

-- Comportamiento
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$insert into public.registro_operacion (operacion, tabla, fecha_hora) values ('INSERT', 'x', now())$$,
  '42501', null, 'anon no puede INSERT');

reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select throws_ok(
  $$insert into public.registro_operacion (operacion, tabla, fecha_hora) values ('INSERT', 'x', now())$$,
  '42501', null, 'service_role no puede INSERT');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"admin":true}}';
select throws_ok($$update public.registro_operacion set tabla = 'x'$$,
  '42501', null, 'ni el admin puede UPDATE');

-- SELECT
select results_eq($$select count(*) > 0 from public.registro_operacion$$, array[true],
  'el admin ve filas');

set local request.jwt.claims = '{"role":"authenticated","app_metadata":{}}';
select results_eq($$select count(*)::int from public.registro_operacion$$, array[0],
  'authenticated sin la marca de admin ve 0 filas');

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select count(*) from public.registro_operacion$$,
  '42501', null, 'anon no puede SELECT');

reset role;
select * from finish();
rollback;
