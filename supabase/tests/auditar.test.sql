-- Criterio 7: el trigger public.auditar() registra operaciones en registro_operacion.
-- Las tablas de prueba viven solo dentro de esta transaccion (rollback al final).
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Funcion
select has_function('public', 'auditar', array[]::text[], 'existe public.auditar()');
select function_returns('public', 'auditar', array[]::text[], 'trigger', 'auditar() es una trigger function');
select is_definer('public', 'auditar', array[]::text[], 'auditar() es SECURITY DEFINER');
select function_privs_are('public', 'auditar', array[]::text[], 'anon', array[]::text[],
  'anon no puede ejecutar auditar()');
select function_privs_are('public', 'auditar', array[]::text[], 'authenticated', array[]::text[],
  'authenticated no puede ejecutar auditar()');
select function_privs_are('public', 'auditar', array[]::text[], 'service_role', array[]::text[],
  'service_role no puede ejecutar auditar()');

-- Tablas de prueba con RLS y trigger
create table public.zz_prueba_id (id int primary key, nombre text);
create table public.zz_prueba_pk (a int, b int, valor text, primary key (a, b));
alter table public.zz_prueba_id enable row level security;
alter table public.zz_prueba_pk enable row level security;
create policy todo on public.zz_prueba_id for all to anon, authenticated using (true) with check (true);
create policy todo on public.zz_prueba_pk for all to anon, authenticated using (true) with check (true);
grant all on public.zz_prueba_id, public.zz_prueba_pk to anon, authenticated;

select lives_ok($$create trigger aud after insert or update or delete on public.zz_prueba_id
  for each row execute function public.auditar()$$, 'trigger auditar() sobre tabla con id');
select lives_ok($$create trigger aud after insert or update or delete on public.zz_prueba_pk
  for each row execute function public.auditar()$$, 'trigger auditar() sobre tabla con PK compuesta');

-- Usuario minimo en auth.users
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
        'authenticated', 'authenticated', 'auditor@test.local');

-- Sin sesion: usuario_id NULL
select lives_ok($$insert into public.zz_prueba_id values (100, 'sistema')$$,
  'escritura sin sesion se completa');
select results_eq(
  $$select usuario_id::text, operacion::text, tabla::text, registro_id
    from public.registro_operacion where tabla = 'zz_prueba_id' and registro_id = '100'$$,
  $$values (null::text, 'INSERT'::text, 'zz_prueba_id'::text, '100'::text)$$,
  'sin sesion, usuario_id queda NULL');

-- Con sesion de admin: INSERT, UPDATE, DELETE sobre tabla con id
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111","app_metadata":{"admin":true}}';
insert into public.zz_prueba_id values (1, 'a');
update public.zz_prueba_id set nombre = 'b' where id = 1;
delete from public.zz_prueba_id where id = 1;
reset role;

select results_eq(
  $$select usuario_id::text, operacion::text, tabla::text, registro_id
    from public.registro_operacion where tabla = 'zz_prueba_id' and registro_id = '1' order by id$$,
  $$values ('11111111-1111-1111-1111-111111111111'::text, 'INSERT'::text, 'zz_prueba_id'::text, '1'::text),
           ('11111111-1111-1111-1111-111111111111', 'UPDATE', 'zz_prueba_id', '1'),
           ('11111111-1111-1111-1111-111111111111', 'DELETE', 'zz_prueba_id', '1')$$,
  'registra usuario (auth.uid()), operacion, tabla y registro_id');

select results_eq(
  $$select datos_anteriores, datos_nuevos
    from public.registro_operacion where tabla = 'zz_prueba_id' and registro_id = '1' order by id$$,
  $$values (null::jsonb, '{"id":1,"nombre":"a"}'::jsonb),
           ('{"id":1,"nombre":"a"}'::jsonb, '{"id":1,"nombre":"b"}'::jsonb),
           ('{"id":1,"nombre":"b"}'::jsonb, null::jsonb)$$,
  'guarda OLD y NEW completos (NULL donde no aplica)');

-- Tabla con PK compuesta (sin id): registro_id NULL, datos completos
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111","app_metadata":{"admin":true}}';
select lives_ok($$insert into public.zz_prueba_pk values (1, 2, 'x')$$,
  'escribir en tabla sin id no aborta');
delete from public.zz_prueba_pk where a = 1 and b = 2;
reset role;

select results_eq(
  $$select usuario_id::text, operacion::text, tabla::text, registro_id
    from public.registro_operacion where tabla = 'zz_prueba_pk' order by id$$,
  $$values ('11111111-1111-1111-1111-111111111111'::text, 'INSERT'::text, 'zz_prueba_pk'::text, null::text),
           ('11111111-1111-1111-1111-111111111111', 'DELETE', 'zz_prueba_pk', null)$$,
  'PK compuesta: registro_id NULL');

select results_eq(
  $$select datos_anteriores, datos_nuevos
    from public.registro_operacion where tabla = 'zz_prueba_pk' order by id$$,
  $$values (null::jsonb, '{"a":1,"b":2,"valor":"x"}'::jsonb),
           ('{"a":1,"b":2,"valor":"x"}'::jsonb, null::jsonb)$$,
  'PK compuesta: OLD/NEW completos incluyen la clave');

-- Falla cerrada: sub inexistente en auth.users -> la escritura falla (FK, 23503)
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"99999999-9999-9999-9999-999999999999","app_metadata":{"admin":true}}';
select throws_ok($$insert into public.zz_prueba_id values (200, 'huerfano')$$,
  '23503', null, 'INSERT con sub inexistente en auth.users falla (falla cerrada)');
select throws_ok($$update public.zz_prueba_id set nombre = 'huerfano2' where id = 100$$,
  '23503', null, 'UPDATE con sub inexistente en auth.users falla (falla cerrada)');
select throws_ok($$delete from public.zz_prueba_id where id = 100$$,
  '23503', null, 'DELETE con sub inexistente en auth.users falla (falla cerrada)');

-- sub que no es uuid: auth.uid() no puede castearlo
set local request.jwt.claims =
  '{"role":"authenticated","sub":"no-es-uuid","app_metadata":{"admin":true}}';
select throws_ok($$update public.zz_prueba_id set nombre = 'x' where id = 100$$,
  '22P02', null, 'sub que no es uuid hace fallar la escritura (falla cerrada)');
reset role;

select * from finish();
rollback;
