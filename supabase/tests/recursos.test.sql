-- Corte recursos, fase A (criterios 7, 8 y 11): tabla recurso, ordenar_recursos() y bucket 'talleres' de Storage.
-- No depende del seed: el usuario de prueba se crea dentro de la transaccion (rollback al final).
--
-- Notas de diseno del test:
-- - UPDATE de anon da 42501 (el UPDATE a nivel tabla esta revocado); UPDATE y DELETE de authenticated sin marca
--   afectan 0 filas (RLS). Se ejecutan sueltos y se verifica el valor resultante como postgres.
-- - Despues de `reset role` el claim sigue puesto: postgres no escribe en recurso mientras haya claims, para no
--   ensuciar la auditoria con el usuario_id del admin.
-- - No hay trigger que lea storage.objects (spec v2, critica punto 1): tamanio_bytes lo manda el cliente.
-- - storage.objects no se borra por SQL salvo que storage.allow_delete_query = 'true' (trigger protect_delete): el test
--   lo fija solo en la seccion de DELETE, como hace storage-api en cada request. Lo demas lo limpia el rollback.
-- - El orden inicial de 'Ord 1..3' (10, 20, 30) no coincide con ninguna convencion de posicion (0 o 1 base):
--   asi la primera llamada a ordenar_recursos audita las 3 filas y las siguientes se cuentan en forma absoluta.
begin;
create extension if not exists pgtap with schema extensions;
select plan(72);

-- Soporte del test (como postgres) ---------------------------------------------
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555',
        'authenticated', 'authenticated', 'recursos-admin@test.local');

insert into public.categoria (nivel_id, nombre, descripcion, activo) values (1, 'Cat Rec', 'base', true);

insert into public.taller (categoria_id, nombre, descripcion, estado, created_at, updated_at)
select c.id, v.nombre, 'd', v.estado::public.estado_taller, '2020-01-01', '2020-01-01'
  from public.categoria c,
       (values ('R Pub', 'PUBLICADO'), ('R Bor', 'BORRADOR'), ('R Ina', 'INACTIVO'),
               ('R Otro', 'PUBLICADO'), ('R Orden', 'PUBLICADO')) as v(nombre, estado)
 where c.nombre = 'Cat Rec';

-- Archivos: la ruta empieza con '<taller_id>/'
insert into public.recurso (taller_id, nombre, tipo, ruta_archivo, url, tamanio_bytes, orden, created_at, updated_at)
select t.id, v.nombre, 'PDF'::public.tipo_recurso, t.id::text || v.ruta, null, 100, 1, '2020-01-01', '2020-01-01'
  from public.taller t
  join (values ('R Pub', 'Pub PDF', '/a.pdf'), ('R Bor', 'Bor PDF', '/b.pdf'), ('R Otro', 'Otro PDF', '/o.pdf'))
       as v(taller, nombre, ruta) on v.taller = t.nombre;

-- Enlaces
insert into public.recurso (taller_id, nombre, tipo, ruta_archivo, url, tamanio_bytes, orden, created_at, updated_at)
select t.id, v.nombre, 'ENLACE'::public.tipo_recurso, null, 'https://example.com/' || v.orden, null, v.orden,
       '2020-01-01', '2020-01-01'
  from public.taller t
  join (values ('R Pub', 'Pub Enlace', 2), ('R Ina', 'Ina Enlace', 1),
               ('R Orden', 'Ord 1', 10), ('R Orden', 'Ord 2', 20), ('R Orden', 'Ord 3', 30))
       as v(taller, nombre, orden) on v.taller = t.nombre;

-- Ids que usan las consultas de los tests
do $$
begin
  perform set_config('test.o1', (select id::text from public.recurso where nombre = 'Ord 1'), true);
  perform set_config('test.o2', (select id::text from public.recurso where nombre = 'Ord 2'), true);
  perform set_config('test.o3', (select id::text from public.recurso where nombre = 'Ord 3'), true);
  perform set_config('test.otro', (select id::text from public.recurso where nombre = 'Otro PDF'), true);
  perform set_config('test.t_orden', (select id::text from public.taller where nombre = 'R Orden'), true);
  perform set_config('test.t_otro', (select id::text from public.taller where nombre = 'R Otro'), true);
end $$;

-- Estructura (como postgres) ----------------------------------------------------
select has_table('public', 'recurso', 'existe la tabla recurso');

select results_eq(
  $$select unnest(enum_range(null::public.tipo_recurso))::text$$,
  array['PDF', 'PPTX', 'DOCX', 'IMAGEN', 'VIDEO', 'ENLACE'],
  'tipo_recurso tiene los 6 valores del dominio');

select ok(
  exists(select 1 from pg_indexes
          where schemaname = 'public' and tablename = 'recurso' and indexdef ~ '\(taller_id[,)]'),
  'recurso tiene un indice por taller_id');

select results_eq(
  $$select confdeltype::text from pg_constraint
     where conrelid = 'public.recurso'::regclass and contype = 'f' and confrelid = 'public.taller'::regclass$$,
  array['a'], 'la FK taller_id es sin cascada (NO ACTION)');

select throws_ok(
  $$delete from public.taller where nombre = 'R Pub'$$,
  '23503', null, 'borrar un taller con recursos da 23503 (sin cascada)');

select is_empty(
  $$select tgname from pg_trigger
     where tgrelid = 'public.recurso'::regclass and not tgisinternal
       and tgname not in ('recurso_auditar', 'recurso_tocar_updated_at')$$,
  'recurso solo tiene los triggers de auditoria y updated_at (sin trigger de validacion)');

select ok(
  has_function_privilege('authenticated', 'public.ordenar_recursos(int, int[])', 'execute'),
  'ordenar_recursos: authenticated tiene EXECUTE');
select ok(
  not has_function_privilege('anon', 'public.ordenar_recursos(int, int[])', 'execute'),
  'ordenar_recursos: anon no tiene EXECUTE');
select ok(
  not (select prosecdef from pg_proc where oid = 'public.ordenar_recursos(int, int[])'::regprocedure),
  'ordenar_recursos es security invoker');
select ok(
  (select proconfig from pg_proc where oid = 'public.ordenar_recursos(int, int[])'::regprocedure)
    @> array['search_path=""'],
  'ordenar_recursos fija search_path vacio');

-- Bucket 'talleres' (como postgres) ----------------------------------------------
select results_eq(
  $$select public from storage.buckets where id = 'talleres'$$,
  array[false], 'bucket talleres: public = false');
select results_eq(
  $$select file_size_limit::bigint from storage.buckets where id = 'talleres'$$,
  array[52428800::bigint], 'bucket talleres: file_size_limit = 52428800 (50 MiB)');
select results_eq(
  $$select m::text from storage.buckets b, unnest(b.allowed_mime_types) as m where b.id = 'talleres' order by 1$$,
  $$select m::text from unnest(array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg', 'image/png', 'image/webp', 'video/mp4']) as m order by 1$$,
  'bucket talleres: allowed_mime_types son exactamente los 7 formatos');

-- Politicas de storage.objects para el bucket: sin update, nada para anon ni public
select is_empty(
  $$select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and (coalesce(qual, '') like '%talleres%' or coalesce(with_check, '') like '%talleres%')
       and (roles::text[] && array['anon', 'public'] or cmd in ('UPDATE', 'ALL'))$$,
  'storage.objects: ninguna politica del bucket talleres para anon/public ni de update');

-- anon -------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select results_eq(
  $$select nombre::text from public.recurso order by nombre collate "C"$$,
  array['Ord 1', 'Ord 2', 'Ord 3', 'Otro PDF', 'Pub Enlace', 'Pub PDF'],
  'anon: ve solo los recursos de talleres publicados');
select throws_ok(
  $$insert into public.recurso (taller_id, nombre, tipo, url, orden)
    values ((select id from public.taller where nombre = 'R Pub'), 'Hack', 'ENLACE', 'https://hack.example', 9)$$,
  '42501', null, 'anon: INSERT en recurso da 42501');
select throws_ok(
  $$update public.recurso set nombre = 'hack'$$,
  '42501', null, 'anon: UPDATE en recurso da 42501 (UPDATE revocado a nivel tabla)');
delete from public.recurso;
reset role;
select results_eq($$select count(*)::int from public.recurso$$, array[8],
  'anon: DELETE en recurso no borra nada');

-- authenticated sin marca de admin ------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"55555555-5555-5555-5555-555555555555","app_metadata":{}}';
select results_eq(
  $$select nombre::text from public.recurso order by nombre collate "C"$$,
  array['Ord 1', 'Ord 2', 'Ord 3', 'Otro PDF', 'Pub Enlace', 'Pub PDF'],
  'sin marca: ve solo los recursos de talleres publicados');
select throws_ok(
  $$insert into public.recurso (taller_id, nombre, tipo, url, orden)
    values ((select id from public.taller where nombre = 'R Pub'), 'Hack', 'ENLACE', 'https://hack.example', 9)$$,
  '42501', null, 'sin marca: INSERT en recurso da 42501');
update public.recurso set nombre = 'hack';
delete from public.recurso;
reset role;
select results_eq($$select count(*)::int from public.recurso where nombre = 'hack'$$, array[0],
  'sin marca: UPDATE en recurso no cambia nada');
select results_eq($$select count(*)::int from public.recurso$$, array[8],
  'sin marca: DELETE en recurso no borra nada');

-- admin: visibilidad ---------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"55555555-5555-5555-5555-555555555555","app_metadata":{"admin":true}}';
select results_eq(
  $$select nombre::text from public.recurso order by nombre collate "C"$$,
  array['Bor PDF', 'Ina Enlace', 'Ord 1', 'Ord 2', 'Ord 3', 'Otro PDF', 'Pub Enlace', 'Pub PDF'],
  'admin: ve todos los recursos, tambien los de talleres en borrador e inactivos');

-- admin: altas validas ---------------------------------------------------------------
select lives_ok(
  $$insert into public.recurso (taller_id, nombre, tipo, url, orden)
    values ((select id from public.taller where nombre = 'R Pub'), 'Admin Enlace', 'ENLACE', 'https://example.com/x', 3)$$,
  'admin: INSERT de un enlace valido funciona');
select lives_ok(
  $$insert into public.recurso (taller_id, nombre, tipo, ruta_archivo, tamanio_bytes, orden)
    values ((select id from public.taller where nombre = 'R Pub'), 'Admin PDF', 'PDF',
            (select id::text from public.taller where nombre = 'R Pub') || '/admin.pdf', 5, 4)$$,
  'admin: INSERT de un archivo valido funciona');

-- CHECK archivo xor enlace (los cuatro casos invalidos y sus variantes) --------------------
select throws_ok(
  $$insert into public.recurso (taller_id, nombre, tipo, orden)
    values ((select id from public.taller where nombre = 'R Pub'), 'Mal', 'ENLACE', 9)$$,
  '23514', null, 'CHECK: un ENLACE sin url da 23514');
select throws_ok(
  $$insert into public.recurso (taller_id, nombre, tipo, url, ruta_archivo, orden)
    values ((select id from public.taller where nombre = 'R Pub'), 'Mal', 'ENLACE', 'https://example.com/x',
            (select id::text from public.taller where nombre = 'R Pub') || '/mal.pdf', 9)$$,
  '23514', null, 'CHECK: un ENLACE con ruta_archivo da 23514');
select throws_ok(
  $$insert into public.recurso (taller_id, nombre, tipo, url, tamanio_bytes, orden)
    values ((select id from public.taller where nombre = 'R Pub'), 'Mal', 'ENLACE', 'https://example.com/x', 10, 9)$$,
  '23514', null, 'CHECK: un ENLACE con tamanio_bytes da 23514');
select throws_ok(
  $$insert into public.recurso (taller_id, nombre, tipo, ruta_archivo, url, tamanio_bytes, orden)
    values ((select id from public.taller where nombre = 'R Pub'), 'Mal', 'PDF',
            (select id::text from public.taller where nombre = 'R Pub') || '/mal.pdf', 'https://example.com/x', 10, 9)$$,
  '23514', null, 'CHECK: un archivo con url da 23514');
select throws_ok(
  $$insert into public.recurso (taller_id, nombre, tipo, tamanio_bytes, orden)
    values ((select id from public.taller where nombre = 'R Pub'), 'Mal', 'PDF', 10, 9)$$,
  '23514', null, 'CHECK: un archivo sin ruta_archivo da 23514');
select throws_ok(
  $$insert into public.recurso (taller_id, nombre, tipo, ruta_archivo, orden)
    values ((select id from public.taller where nombre = 'R Pub'), 'Mal', 'PDF',
            (select id::text from public.taller where nombre = 'R Pub') || '/mal.pdf', 9)$$,
  '23514', null, 'CHECK: un archivo sin tamanio_bytes da 23514');

-- Otros CHECK y unique ---------------------------------------------------------------------
select throws_ok(
  $$insert into public.recurso (taller_id, nombre, tipo, url, orden)
    values ((select id from public.taller where nombre = 'R Pub'), 'Mal', 'ENLACE', 'http://example.com/x', 9)$$,
  '23514', null, 'CHECK: una url sin https:// da 23514');
select throws_ok(
  $$insert into public.recurso (taller_id, nombre, tipo, ruta_archivo, tamanio_bytes, orden)
    values ((select id from public.taller where nombre = 'R Pub'), 'Mal', 'PDF', '999999/mal.pdf', 10, 9)$$,
  '23514', null, 'CHECK: una ruta fuera de <taller_id>/ da 23514');
select throws_ok(
  $$insert into public.recurso (taller_id, nombre, tipo, ruta_archivo, tamanio_bytes, orden)
    values ((select id from public.taller where nombre = 'R Pub'), 'Mal', 'PDF',
            (select id::text from public.taller where nombre = 'R Pub') || '1/mal.pdf', 10, 9)$$,
  '23514', null, 'CHECK: una ruta con un prefijo numerico parecido (id seguido de otro digito) da 23514');
select throws_ok(
  $$insert into public.recurso (taller_id, nombre, tipo, ruta_archivo, tamanio_bytes, orden)
    values ((select id from public.taller where nombre = 'R Pub'), 'Mal', 'PDF',
            (select id::text from public.taller where nombre = 'R Pub') || '/mal.pdf', 0, 9)$$,
  '23514', null, 'CHECK: tamanio_bytes = 0 da 23514');
select throws_ok(
  $$insert into public.recurso (taller_id, nombre, tipo, url, orden)
    values ((select id from public.taller where nombre = 'R Pub'), '   ', 'ENLACE', 'https://example.com/x', 9)$$,
  '23514', null, 'CHECK: un nombre en blanco da 23514');
select throws_ok(
  $$insert into public.recurso (taller_id, nombre, tipo, ruta_archivo, tamanio_bytes, orden)
    values ((select id from public.taller where nombre = 'R Pub'), 'Duplicada', 'PDF',
            (select ruta_archivo from public.recurso where nombre = 'Pub PDF'), 10, 9)$$,
  '23505', null, 'ruta_archivo repetida da 23505');

-- UPDATE: taller_id es inmutable, el resto de las columnas editables ----------------------------
select throws_ok(
  $$update public.recurso set taller_id = (select id from public.taller where nombre = 'R Otro')
    where nombre = 'Pub Enlace'$$,
  '42501', null, 'admin: UPDATE de recurso.taller_id da 42501');
select lives_ok(
  $$update public.recurso set nombre = 'Pub Enlace v2', url = 'https://example.com/v2', orden = 7
    where nombre = 'Pub Enlace'$$,
  'admin: UPDATE de nombre, url y orden en recurso funciona');
select lives_ok(
  $$update public.recurso
       set ruta_archivo = (select id::text from public.taller where nombre = 'R Bor') || '/b2.docx',
           tipo = 'DOCX', tamanio_bytes = 200
     where nombre = 'Bor PDF'$$,
  'admin: UPDATE de ruta_archivo, tipo y tamanio_bytes (reemplazo) funciona');
select lives_ok(
  $$delete from public.recurso where nombre = 'Admin PDF'$$,
  'admin: DELETE de un recurso funciona');

-- admin: Storage ----------------------------------------------------------------------------
select lives_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('talleres', (select id::text from public.taller where nombre = 'R Pub') || '/seed.pdf', '{"size": 10}')$$,
  'admin: INSERT en storage.objects del bucket talleres funciona');
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'talleres'$$,
  array[1], 'admin: lee los objetos del bucket talleres');

-- admin: ordenar_recursos -------------------------------------------------------------------------
select lives_ok(
  $$select public.ordenar_recursos(current_setting('test.t_orden')::int,
      array[current_setting('test.o1')::int, current_setting('test.o2')::int, current_setting('test.o3')::int])$$,
  'ordenar_recursos: reordena con la lista completa');
select results_eq(
  $$select nombre::text from public.recurso
     where taller_id = current_setting('test.t_orden')::int order by orden, id$$,
  array['Ord 1', 'Ord 2', 'Ord 3'], 'ordenar_recursos: deja los recursos en el orden pedido');
reset role;
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'recurso' and operacion = 'UPDATE' and usuario_id = '55555555-5555-5555-5555-555555555555'
       and registro_id in (current_setting('test.o1'), current_setting('test.o2'), current_setting('test.o3'))$$,
  array[3], 'ordenar_recursos: la primera llamada audita las 3 filas cuyo orden cambia');

set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"55555555-5555-5555-5555-555555555555","app_metadata":{"admin":true}}';
select lives_ok(
  $$select public.ordenar_recursos(current_setting('test.t_orden')::int,
      array[current_setting('test.o1')::int, current_setting('test.o2')::int, current_setting('test.o3')::int])$$,
  'ordenar_recursos: repetir el mismo orden funciona');
reset role;
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'recurso' and operacion = 'UPDATE' and usuario_id = '55555555-5555-5555-5555-555555555555'
       and registro_id in (current_setting('test.o1'), current_setting('test.o2'), current_setting('test.o3'))$$,
  array[3], 'ordenar_recursos: repetir el mismo orden no audita ninguna fila');

set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"55555555-5555-5555-5555-555555555555","app_metadata":{"admin":true}}';
select lives_ok(
  $$select public.ordenar_recursos(current_setting('test.t_orden')::int,
      array[current_setting('test.o2')::int, current_setting('test.o1')::int, current_setting('test.o3')::int])$$,
  'ordenar_recursos: intercambiar dos recursos funciona');
select results_eq(
  $$select nombre::text from public.recurso
     where taller_id = current_setting('test.t_orden')::int order by orden, id$$,
  array['Ord 2', 'Ord 1', 'Ord 3'], 'ordenar_recursos: el intercambio queda en el orden pedido');
reset role;
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'recurso' and operacion = 'UPDATE' and usuario_id = '55555555-5555-5555-5555-555555555555'
       and registro_id in (current_setting('test.o1'), current_setting('test.o2'), current_setting('test.o3'))$$,
  array[5], 'ordenar_recursos: el intercambio audita solo las 2 filas cambiadas');

-- Listas que no coinciden con los recursos del taller -> P0001
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"55555555-5555-5555-5555-555555555555","app_metadata":{"admin":true}}';
select throws_ok(
  $$select public.ordenar_recursos(current_setting('test.t_orden')::int,
      array[current_setting('test.o1')::int, current_setting('test.o2')::int])$$,
  'P0001', null, 'ordenar_recursos: una lista a la que le falta un recurso da P0001');
select throws_ok(
  $$select public.ordenar_recursos(current_setting('test.t_orden')::int,
      array[current_setting('test.o1')::int, current_setting('test.o2')::int, current_setting('test.o3')::int, 999999])$$,
  'P0001', null, 'ordenar_recursos: una lista con un id de mas da P0001');
select throws_ok(
  $$select public.ordenar_recursos(current_setting('test.t_orden')::int,
      array[current_setting('test.o1')::int, current_setting('test.o2')::int, current_setting('test.otro')::int])$$,
  'P0001', null, 'ordenar_recursos: una lista con el id de un recurso de otro taller da P0001');
select throws_ok(
  $$select public.ordenar_recursos(current_setting('test.t_orden')::int,
      array[current_setting('test.o1')::int, current_setting('test.o1')::int, current_setting('test.o3')::int])$$,
  'P0001', null, 'ordenar_recursos: una lista con un id repetido da P0001');
select throws_ok(
  $$select public.ordenar_recursos(current_setting('test.t_otro')::int,
      array[current_setting('test.o1')::int, current_setting('test.o2')::int, current_setting('test.o3')::int])$$,
  'P0001', null, 'ordenar_recursos: pasar los ids de un taller con el id de otro taller da P0001');
reset role;

-- ordenar_recursos sin marca: no cambia nada, no da error --------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"55555555-5555-5555-5555-555555555555","app_metadata":{}}';
select lives_ok(
  $$select public.ordenar_recursos(current_setting('test.t_orden')::int,
      array[current_setting('test.o1')::int, current_setting('test.o2')::int, current_setting('test.o3')::int])$$,
  'sin marca: ordenar_recursos no da error (la RLS deja 0 filas)');
reset role;
select results_eq(
  $$select nombre::text from public.recurso
     where taller_id = current_setting('test.t_orden')::int order by orden, id$$,
  array['Ord 2', 'Ord 1', 'Ord 3'], 'sin marca: ordenar_recursos no cambia el orden');
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'recurso' and operacion = 'UPDATE' and usuario_id = '55555555-5555-5555-5555-555555555555'
       and registro_id in (current_setting('test.o1'), current_setting('test.o2'), current_setting('test.o3'))$$,
  array[5], 'sin marca: ordenar_recursos no audita nada');

-- ordenar_recursos anon ---------------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$select public.ordenar_recursos(current_setting('test.t_orden')::int, array[current_setting('test.o1')::int])$$,
  '42501', null, 'anon: ordenar_recursos da 42501');

-- anon: Storage ----------------------------------------------------------------------------------------
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'talleres'$$,
  array[0], 'anon: no lee objetos del bucket talleres');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('talleres', (select id::text from public.taller where nombre = 'R Pub') || '/anon.pdf', '{"size": 10}')$$,
  '42501', null, 'anon: INSERT en storage.objects del bucket talleres da 42501');
reset role;

-- sin marca: Storage -------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"55555555-5555-5555-5555-555555555555","app_metadata":{}}';
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'talleres'$$,
  array[0], 'sin marca: no lee objetos del bucket talleres');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('talleres', (select id::text from public.taller where nombre = 'R Pub') || '/sinmarca.pdf', '{"size": 10}')$$,
  '42501', null, 'sin marca: INSERT en storage.objects del bucket talleres da 42501');
reset role;

-- Storage: DELETE ------------------------------------------------------------------------------------------
-- El trigger protect_delete de storage.objects bloquea el DELETE salvo que storage.allow_delete_query = 'true', que
-- storage-api fija en cada request antes de borrar con el rol del usuario. Se reproduce aca para probar la politica.
-- Va al final de la seccion de Storage: el borrado del admin saca el unico objeto que usan los asserts de lectura.
set local storage.allow_delete_query = 'true';

-- Un DELETE con WHERE tambien exige que la politica de select deje ver la fila: sin la marca, esa politica ya oculta el
-- objeto y el DELETE borraria 0 filas aunque la politica de delete estuviera abierta. Para probar la politica de delete
-- sola, se abre el select de forma temporal (se quita antes de seguir).
create policy zz_select_temporal on storage.objects for select to authenticated using (bucket_id = 'talleres');

set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"55555555-5555-5555-5555-555555555555","app_metadata":{}}';
delete from storage.objects where bucket_id = 'talleres';
reset role;
drop policy zz_select_temporal on storage.objects;
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'talleres'$$,
  array[1], 'sin marca: DELETE en storage.objects del bucket talleres no borra nada');

set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"55555555-5555-5555-5555-555555555555","app_metadata":{"admin":true}}';
delete from storage.objects where bucket_id = 'talleres';
reset role;
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'talleres'$$,
  array[0], 'admin: DELETE en storage.objects del bucket talleres borra el objeto');

-- Resultados de las escrituras del admin (como postgres) ---------------------------------------------------
select results_eq(
  $$select updated_at > '2020-01-02'::timestamptz from public.recurso where nombre = 'Pub Enlace v2'$$,
  array[true], 'recurso: updated_at se actualiza solo despues de un UPDATE');
select results_eq(
  $$select tipo::text, tamanio_bytes::int, ruta_archivo::text = id_taller.id::text || '/b2.docx'
      from public.recurso, (select id from public.taller where nombre = 'R Bor') as id_taller
     where nombre = 'Bor PDF'$$,
  $$values ('DOCX'::text, 200, true)$$,
  'el UPDATE de reemplazo dejo ruta, tipo y tamanio nuevos');
select results_eq(
  $$select count(*)::int from public.recurso where nombre = 'Admin PDF'$$,
  array[0], 'el DELETE del admin borro la fila');

-- Auditoria con el sub del admin ------------------------------------------------------------------------------
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'recurso' and operacion = 'INSERT'
       and registro_id = (select id::text from public.recurso where nombre = 'Admin Enlace')
       and usuario_id = '55555555-5555-5555-5555-555555555555'$$,
  array[1], 'el INSERT de recurso del admin queda en registro_operacion con su usuario_id');
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'recurso' and operacion = 'UPDATE'
       and registro_id = (select id::text from public.recurso where nombre = 'Pub Enlace v2')
       and usuario_id = '55555555-5555-5555-5555-555555555555'$$,
  array[1], 'el UPDATE de recurso del admin queda en registro_operacion con su usuario_id');
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'recurso' and operacion = 'DELETE'
       and datos_anteriores ->> 'nombre' = 'Admin PDF'
       and usuario_id = '55555555-5555-5555-5555-555555555555'$$,
  array[1], 'el DELETE de recurso del admin queda en registro_operacion con su usuario_id');

select * from finish();
rollback;
