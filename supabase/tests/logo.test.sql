-- Logo institucional (#23): CHECK de configuracion.logo_ruta, bucket publico 'logo' y sus politicas de
-- storage.objects (solo el admin sube, lista y borra; sin update). No depende del seed: el usuario de prueba se crea
-- dentro de la transaccion (rollback al final). La fila id = 1 de configuracion la inserta su migracion.
--
-- Notas de diseno del test:
-- - El CHECK se prueba como postgres (saltea la RLS): 23514 ante un formato invalido.
-- - Un INSERT en storage.objects sin permiso da 42501. Un DELETE sin permiso no da error: afecta 0 filas. Para que el
--   DELETE del admin pruebe SU politica hace falta que el select deje ver la fila y storage.allow_delete_query (ver
--   recursos.test.sql): en el caso "sin marca" se crea una politica de select temporal.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777',
        'authenticated', 'authenticated', 'logo-admin@test.local');

-- CHECK de logo_ruta (como postgres) -------------------------------------------------------------
select results_eq(
  $$select count(*)::int from pg_constraint
     where conrelid = 'public.configuracion'::regclass and conname = 'configuracion_logo_ruta_formato'
       and contype = 'c'$$,
  array[1], 'configuracion tiene el CHECK configuracion_logo_ruta_formato');
select lives_ok(
  $$update public.configuracion set logo_ruta = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1.png' where id = 1$$,
  'CHECK: acepta <uuid>.png');
select lives_ok(
  $$update public.configuracion set logo_ruta = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2.jpg' where id = 1$$,
  'CHECK: acepta <uuid>.jpg');
select lives_ok(
  $$update public.configuracion set logo_ruta = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3.webp' where id = 1$$,
  'CHECK: acepta <uuid>.webp');
select lives_ok(
  $$update public.configuracion set logo_ruta = null where id = 1$$,
  'CHECK: acepta NULL (sin logo)');
select throws_ok(
  $$update public.configuracion set logo_ruta = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4.gif' where id = 1$$,
  '23514', null, 'CHECK: rechaza .gif');
select throws_ok(
  $$update public.configuracion set logo_ruta = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5.jpeg' where id = 1$$,
  '23514', null, 'CHECK: rechaza .jpeg (el cliente guarda siempre .jpg)');
select throws_ok(
  $$update public.configuracion set logo_ruta = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6.PNG' where id = 1$$,
  '23514', null, 'CHECK: rechaza la extension en mayusculas');
select throws_ok(
  $$update public.configuracion set logo_ruta = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAA7.png' where id = 1$$,
  '23514', null, 'CHECK: rechaza el uuid en mayusculas');
select throws_ok(
  $$update public.configuracion set logo_ruta = 'carpeta/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8.png' where id = 1$$,
  '23514', null, 'CHECK: rechaza una ruta con carpeta');
select throws_ok(
  $$update public.configuracion set logo_ruta = 'logo.png' where id = 1$$,
  '23514', null, 'CHECK: rechaza un nombre que no es un uuid');
select throws_ok(
  $$update public.configuracion set logo_ruta = '' where id = 1$$,
  '23514', null, 'CHECK: rechaza la cadena vacia');

-- Bucket 'logo' (como postgres) ---------------------------------------------------------------------
select results_eq(
  $$select public from storage.buckets where id = 'logo'$$,
  array[true], 'bucket logo: public = true');
select results_eq(
  $$select file_size_limit::bigint from storage.buckets where id = 'logo'$$,
  array[2097152::bigint], 'bucket logo: file_size_limit = 2097152 (2 MiB)');
select results_eq(
  $$select m::text from storage.buckets b, unnest(b.allowed_mime_types) as m where b.id = 'logo' order by 1$$,
  array['image/jpeg', 'image/png', 'image/webp'], 'bucket logo: allowed_mime_types es PNG, JPEG y WebP (sin SVG)');
select is_empty(
  $$select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and (coalesce(qual, '') like '%''logo''%' or coalesce(with_check, '') like '%''logo''%')
       and (roles::text[] && array['anon', 'public'] or cmd in ('UPDATE', 'ALL'))$$,
  'storage.objects: ninguna politica del bucket logo para anon/public ni de update');
select results_eq(
  $$select p.cmd::text from pg_policies p
     where p.schemaname = 'storage' and p.tablename = 'objects'
       and (coalesce(p.qual, '') like '%''logo''%' or coalesce(p.with_check, '') like '%''logo''%')
       and p.roles = array['authenticated']::name[]
       and (coalesce(p.qual, '') like '%es_admin%' or coalesce(p.with_check, '') like '%es_admin%')
     order by 1$$,
  array['DELETE', 'INSERT', 'SELECT'],
  'storage.objects: el bucket logo tiene politicas select, insert y delete solo para el admin');

-- Objeto de soporte, para comprobar que anon y el usuario sin marca no lo ven ni lo borran
insert into storage.objects (bucket_id, name, metadata)
values ('logo', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1.png', '{"size": 10}');

-- anon -----------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'logo'$$,
  array[0], 'anon: no lee objetos del bucket logo por la API de tablas');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('logo', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2.png', '{"size": 10}')$$,
  '42501', null, 'anon: INSERT en storage.objects del bucket logo da 42501');
select results_eq(
  $$select logo_ruta is null from public.configuracion where id = 1$$,
  array[true], 'anon: lee la fila de configuracion (sin logo)');
update public.configuracion set logo_ruta = 'cccccccc-cccc-cccc-cccc-ccccccccccc1.png' where id = 1;
reset role;
select results_eq(
  $$select logo_ruta is null from public.configuracion where id = 1$$,
  array[true], 'anon: UPDATE de logo_ruta no cambia nada');

-- authenticated sin la marca de admin ------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"77777777-7777-7777-7777-777777777777","app_metadata":{}}';
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'logo'$$,
  array[0], 'sin marca: no lee objetos del bucket logo');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('logo', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3.png', '{"size": 10}')$$,
  '42501', null, 'sin marca: INSERT en storage.objects del bucket logo da 42501');
update public.configuracion set logo_ruta = 'cccccccc-cccc-cccc-cccc-ccccccccccc2.png' where id = 1;
reset role;
select results_eq(
  $$select logo_ruta is null from public.configuracion where id = 1$$,
  array[true], 'sin marca: UPDATE de logo_ruta no cambia nada');

-- Storage: DELETE sin marca (ver recursos.test.sql: allow_delete_query y la politica de select temporal)
set local storage.allow_delete_query = 'true';
create policy zz_select_temporal on storage.objects for select to authenticated using (bucket_id = 'logo');
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"77777777-7777-7777-7777-777777777777","app_metadata":{}}';
delete from storage.objects where bucket_id = 'logo';
reset role;
drop policy zz_select_temporal on storage.objects;
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'logo'$$,
  array[1], 'sin marca: DELETE en storage.objects del bucket logo no borra nada');

-- admin -------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"77777777-7777-7777-7777-777777777777","app_metadata":{"admin":true}}';
select lives_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('logo', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4.png', '{"size": 10}')$$,
  'admin: INSERT en storage.objects del bucket logo funciona');
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'logo'$$,
  array[2], 'admin: lee los objetos del bucket logo');
update storage.objects set name = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5.png'
 where bucket_id = 'logo' and name = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4.png';
select results_eq(
  $$select count(*)::int from storage.objects
     where bucket_id = 'logo' and name = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4.png'$$,
  array[1], 'admin: UPDATE en storage.objects no cambia nada (sin politica de update)');
select lives_ok(
  $$update public.configuracion set logo_ruta = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4.png' where id = 1$$,
  'admin: UPDATE de logo_ruta funciona');
select results_eq(
  $$select logo_ruta::text from public.configuracion where id = 1$$,
  array['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4.png'], 'admin: el UPDATE dejo la ruta del logo');
-- UPDATE condicional del cliente: si la fila ya no apunta a la ruta anterior no encuentra nada y no cambia nada
update public.configuracion set logo_ruta = null
 where id = 1 and logo_ruta = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb9.png';
select results_eq(
  $$select logo_ruta::text from public.configuracion where id = 1$$,
  array['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4.png'],
  'admin: el UPDATE condicional con una ruta anterior que ya no es la actual no cambia la fila');
delete from storage.objects where bucket_id = 'logo';
reset role;
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'logo'$$,
  array[0], 'admin: DELETE en storage.objects del bucket logo borra los objetos');

select * from finish();
rollback;
