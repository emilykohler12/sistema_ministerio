-- Historial de operaciones (issue #20; docs/specs/historial-operaciones/spec.md y critica.md, seccion Respuesta).
-- No depende del seed: el soporte se crea dentro de la transaccion (rollback al final). Los usuarios de prueba se filtran por
-- el prefijo 'historial-' del email, porque la base puede traer ya los usuarios del seed.
--
-- CONTRATO (lo que debe cumplir la migracion; el test llama por nombre):
--
--   public.usuarios_historial() returns table (id uuid, email text)
--     LANGUAGE plpgsql (una funcion sql no puede lanzar el 42501), SECURITY DEFINER, search_path vacio. es_admin() primero: sin la marca, 42501.
--     EXECUTE solo authenticated (revoke explicito de public, anon y service_role).
--     distinct usuario_id de registro_operacion cruzado con auth.users; email::text no nulo; orden por email.
--     Un usuario baneado (banned_until futuro) sigue saliendo (§10.1).
--   Indices en registro_operacion: (fecha_hora) y (tabla, fecha_hora).
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Soporte del test (como postgres) ---------------------------------------------
--   A: dos operaciones; B: baneado (banned_until futuro) con una; C: sin operaciones; D: sin email, con una operacion.
insert into auth.users (instance_id, id, aud, role, email, banned_until)
values ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
        'historial-a@test.local', null),
       ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
        'historial-0-baneado@test.local', now() + interval '10 years'),
       ('00000000-0000-0000-0000-000000000000', 'cccccccc-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
        'historial-c-sin-operaciones@test.local', null);
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', 'dddddddd-0000-0000-0000-000000000004', 'authenticated', 'authenticated', null);

insert into public.registro_operacion (usuario_id, operacion, tabla, registro_id, fecha_hora)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'INSERT', 'tabla_prueba', '1', now()),
       ('aaaaaaaa-0000-0000-0000-000000000001', 'UPDATE', 'tabla_prueba', '1', now()),
       ('bbbbbbbb-0000-0000-0000-000000000002', 'INSERT', 'tabla_prueba', '2', now()),
       ('dddddddd-0000-0000-0000-000000000004', 'INSERT', 'tabla_prueba', '3', now()),
       (null, 'INSERT', 'tabla_prueba', '4', now());

-- Estructura y privilegios (como postgres) -------------------------------------------
select has_function('public', 'usuarios_historial', 'existe usuarios_historial()');

select is(
  pg_get_function_result('public.usuarios_historial()'::regprocedure),
  'TABLE(id uuid, email text)',
  'usuarios_historial devuelve exactamente (id uuid, email text)');

select is_empty(
  $$select p.proname::text from pg_proc p join pg_language l on l.oid = p.prolang
     where p.pronamespace = 'public'::regnamespace and p.proname = 'usuarios_historial' and l.lanname <> 'plpgsql'$$,
  'usuarios_historial es plpgsql (el chequeo de es_admin() se ejecuta siempre y primero)');

select is_empty(
  $$select proname::text from pg_proc
     where pronamespace = 'public'::regnamespace and proname = 'usuarios_historial' and not prosecdef$$,
  'usuarios_historial es security definer (auth.users no es legible por el admin)');

select is_empty(
  $$select proname::text from pg_proc
     where pronamespace = 'public'::regnamespace and proname = 'usuarios_historial'
       and not coalesce(proconfig @> array['search_path=""'], false)$$,
  'usuarios_historial fija search_path vacio');

select is_empty(
  $$select proname::text from pg_proc
     where pronamespace = 'public'::regnamespace and proname = 'usuarios_historial'
       and has_function_privilege('anon', oid, 'execute')$$,
  'anon no tiene EXECUTE');

select is_empty(
  $$select p.proname::text from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = 'usuarios_historial'
       and (p.proacl is null
            or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))$$,
  'no da EXECUTE a public (ni lo deja por defecto)');

select is_empty(
  $$select proname::text from pg_proc
     where pronamespace = 'public'::regnamespace and proname = 'usuarios_historial'
       and has_function_privilege('service_role', oid, 'execute')$$,
  'service_role no tiene EXECUTE (revoke explicito)');

select results_eq(
  $$select count(*)::int from pg_proc
     where pronamespace = 'public'::regnamespace and proname = 'usuarios_historial'
       and has_function_privilege('authenticated', oid, 'execute')$$,
  array[1], 'authenticated tiene EXECUTE');

-- Indices ------------------------------------------------------------------------------
select ok(
  exists (select 1 from pg_indexes
           where schemaname = 'public' and tablename = 'registro_operacion' and indexdef ~ '\(fecha_hora\)$'),
  'existe un indice sobre registro_operacion (fecha_hora)');

select ok(
  exists (select 1 from pg_indexes
           where schemaname = 'public' and tablename = 'registro_operacion' and indexdef ~ '\(tabla, fecha_hora\)$'),
  'existe un indice sobre registro_operacion (tabla, fecha_hora)');

-- Admin ---------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"aaaaaaaa-0000-0000-0000-000000000001","app_metadata":{"admin":true}}';

-- B (bbbb…) ordena por email ANTES que A (aaaa…): el orden por email difiere del de uuid y del de insercion.
select results_eq(
  $$select email from public.usuarios_historial() where email like 'historial-%'$$,
  $$values ('historial-0-baneado@test.local'::text), ('historial-a@test.local')$$,
  'devuelve solo usuarios con operaciones, ordenados por email (no por uuid)');

select is_empty(
  $$select id from public.usuarios_historial() where id = 'cccccccc-0000-0000-0000-000000000003'$$,
  'un usuario sin operaciones no aparece');

select results_eq(
  $$select count(*)::int from public.usuarios_historial() where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  array[1], 'un usuario con varias operaciones aparece una sola vez');

select results_eq(
  $$select email from public.usuarios_historial() where id = 'bbbbbbbb-0000-0000-0000-000000000002'$$,
  array['historial-0-baneado@test.local'::text], 'un usuario baneado (banned_until futuro) sigue apareciendo con su email');

select is_empty(
  $$select id from public.usuarios_historial() where email is null$$,
  'no devuelve emails nulos (cuenta sin email)');

select is_empty(
  $$select id from public.usuarios_historial() where id is null$$,
  'las operaciones del sistema (usuario_id NULL) no generan una fila de usuario');

select results_eq(
  $$select pg_typeof(email)::text from public.usuarios_historial() limit 1$$,
  array['text'], 'email sale como text (no varchar)');

-- Sin marca de admin y anon ------------------------------------------------------------
set local request.jwt.claims =
  '{"role":"authenticated","sub":"aaaaaaaa-0000-0000-0000-000000000001","app_metadata":{}}';
select throws_ok(
  $$select * from public.usuarios_historial()$$,
  '42501', null, 'sin marca (app_metadata vacio): 42501 aunque tenga EXECUTE, porque es_admin() va primero');

set local request.jwt.claims = '{"role":"authenticated","sub":"aaaaaaaa-0000-0000-0000-000000000001"}';
select throws_ok(
  $$select * from public.usuarios_historial()$$,
  '42501', null, 'sin app_metadata: 42501');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$select * from public.usuarios_historial()$$,
  '42501', null, 'anon: 42501 (sin EXECUTE)');

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select throws_ok(
  $$select * from public.usuarios_historial()$$,
  '42501', null, 'service_role: 42501 (sin EXECUTE)');

reset role;
select * from finish();
rollback;
