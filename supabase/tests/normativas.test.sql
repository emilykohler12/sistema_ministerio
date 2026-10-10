-- Corte normativas, fase A (criterios 1, 3, 4, 7 y 8): normativa, normativa_etiqueta, guardar_normativa(),
-- contar_descarga_normativa() y bucket publico 'normativas'. No depende del seed: el usuario de prueba se crea
-- dentro de la transaccion (rollback al final).
--
-- CONTRATO DE LAS RPC (lo que el implementador debe seguir; el test llama por nombre y con estos tipos):
--
--   public.guardar_normativa(
--     p_titulo text,
--     p_descripcion text,
--     p_numero text,
--     p_anio smallint,
--     p_etiquetas text[],
--     p_ruta_archivo text default null,   -- null = conservar el archivo de la fila (en un alta es error 23502)
--     p_id int default null               -- null = alta; un id que no existe en la edicion da P0002 (como guardar_taller)
--   ) returns table (id int, ruta_anterior text)
--
--   - security invoker, search_path = '', EXECUTE solo para authenticated (revoke from public, anon).
--   - Devuelve UNA fila. `id` es el de la normativa guardada. `ruta_anterior` es la ruta que HAY QUE BORRAR del bucket:
--     la que tenia la fila antes del guardado (leida con `select ... for update`), solo si este guardado la reemplazo
--     (p_ruta_archivo no nulo y distinto de la anterior). Si se conserva el archivo, o en un alta, es null.
--   - Guarda numero recortado (btrim). Titulo y descripcion se guardan tal cual.
--   - Etiquetas: se resuelven con public.resolver_etiquetas(p_etiquetas) (las mismas de guardar_taller) y el puente
--     se sincroniza por diferencia.
--   - La edicion nunca toca `descargas`.
--
--   public.contar_descarga_normativa(p_id int) returns void
--   - security definer, search_path = '', sin EXECUTE para public, con EXECUTE para anon y authenticated.
--   - Suma 1 a normativa.descargas sin auditar ni cambiar updated_at. Con un id inexistente no hace nada ni falla.
--
-- Notas de diseno del test:
-- - UPDATE y DELETE sin permiso pueden dar 42501 o afectar 0 filas segun el grant: se ejecutan dentro de un bloque
--   DO que traga insufficient_privilege y se verifica el resultado como postgres. El INSERT sin permiso da 42501.
-- - Las llamadas a guardar_normativa se hacen en bloques DO que guardan el resultado con set_config (pgTAP no
--   expone la fila devuelta). Los nombres de campo `id` y `ruta_anterior` quedan verificados porque el bloque los lee.
-- - p_anio es smallint: el literal entero no se castea solo en una llamada a funcion, por eso `::smallint`.
-- - updated_at: now() es constante dentro de la transaccion. Las filas de soporte tienen updated_at = 2020-01-01.
-- - Despues de `reset role` el claim sigue puesto: postgres no escribe mientras haya claims. Todo el soporte de
--   escritura como postgres esta al principio.
-- - storage.objects no se borra por SQL salvo que storage.allow_delete_query = 'true' (ver recursos.test.sql).
begin;
create extension if not exists pgtap with schema extensions;
select plan(111);

-- Soporte del test (como postgres) ---------------------------------------------
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666',
        'authenticated', 'authenticated', 'normativas-admin@test.local');

insert into public.categoria (nivel_id, nombre, descripcion, activo) values (1, 'Cat Norm', 'base', true);

insert into public.normativa (titulo, descripcion, numero, anio, ruta_archivo, descargas, created_at, updated_at) values
  ('N Base', 'desc base', '100/20', 2020, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1.pdf', 5, '2020-01-01', '2020-01-01');
insert into public.normativa (titulo, descripcion, numero, anio, ruta_archivo, created_at, updated_at) values
  ('N Otro Anio', null, '100/20', 2021, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2.pdf', '2020-01-01', '2020-01-01'),
  ('N Tilde', null, 'Resolución 5', 2022, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3.pdf', '2020-01-01', '2020-01-01'),
  ('N Contador', null, '400', 2023, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4.pdf', '2020-01-01', '2020-01-01'),
  ('N Borrar', null, '500', 2023, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5.pdf', '2020-01-01', '2020-01-01'),
  ('N 1900', null, '600', 1900, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6.pdf', '2020-01-01', '2020-01-01'),
  ('N 2100', null, '601', 2100, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7.pdf', '2020-01-01', '2020-01-01');

insert into public.etiqueta (nombre) values ('Etiq Base'), ('Etiq Borrar');

insert into public.normativa_etiqueta (normativa_id, etiqueta_id)
select n.id, e.id from public.normativa n, public.etiqueta e
 where (n.titulo, e.nombre) in (('N Base', 'Etiq Base'), ('N Borrar', 'Etiq Borrar'));

-- Un UPDATE con rol de bypass (aca postgres, sin claims; service_role tiene el mismo bypass) que cambia descargas Y
-- otra columna: debe auditarse y mover updated_at. Se hace aca porque despues de `reset role` el claim sigue puesto.
update public.normativa set descripcion = 'cambio con bypass', descargas = 7 where titulo = 'N 1900';

do $$
begin
  perform set_config('test.base', (select id::text from public.normativa where titulo = 'N Base'), true);
  perform set_config('test.otro', (select id::text from public.normativa where titulo = 'N Otro Anio'), true);
  perform set_config('test.tilde', (select id::text from public.normativa where titulo = 'N Tilde'), true);
  perform set_config('test.contador', (select id::text from public.normativa where titulo = 'N Contador'), true);
  perform set_config('test.borrar', (select id::text from public.normativa where titulo = 'N Borrar'), true);
  perform set_config('test.etiq_borrar', (select id::text from public.etiqueta where nombre = 'Etiq Borrar'), true);
end $$;

-- Estructura (como postgres) ----------------------------------------------------
select has_table('public', 'normativa', 'existe la tabla normativa');
select has_table('public', 'normativa_etiqueta', 'existe la tabla normativa_etiqueta');

select results_eq(
  $$select column_name::text collate "default", data_type::text collate "default", character_maximum_length::int,
           is_nullable::text collate "default"
      from information_schema.columns
     where table_schema = 'public' and table_name = 'normativa' order by column_name$$,
  $$values
    ('anio'::text, 'smallint'::text, null::int, 'NO'::text),
    ('created_at', 'timestamp with time zone', null, 'NO'),
    ('descargas', 'integer', null, 'NO'),
    ('descripcion', 'text', null, 'YES'),
    ('id', 'integer', null, 'NO'),
    ('numero', 'character varying', 50, 'NO'),
    ('ruta_archivo', 'character varying', 500, 'NO'),
    ('titulo', 'character varying', 200, 'NO'),
    ('updated_at', 'timestamp with time zone', null, 'NO')$$,
  'normativa tiene las columnas, tipos y nulabilidad de la definicion 8.3');

select results_eq(
  $$select descargas from public.normativa where titulo = 'N Otro Anio'$$,
  array[0], 'descargas vale 0 por defecto');

select col_is_pk('public', 'normativa_etiqueta', array['normativa_id', 'etiqueta_id'],
  'normativa_etiqueta tiene PK compuesta (normativa_id, etiqueta_id)');

select results_eq(
  $$select confdeltype::text from pg_constraint
     where conrelid = 'public.normativa_etiqueta'::regclass and contype = 'f'
       and confrelid = 'public.normativa'::regclass$$,
  array['c'], 'la FK normativa_id del puente es con cascada (la baja fisica arrastra el puente)');

select results_eq(
  $$select count(*)::int from public.normativa where numero = '100/20'$$,
  array[2], 'el mismo numero con anio distinto es valido');

-- Limites de anio (las filas de soporte con 1900 y 2100 ya entraron) ---------------------
select results_eq(
  $$select anio::int from public.normativa where titulo in ('N 1900', 'N 2100') order by anio$$,
  array[1900, 2100], 'anio acepta los extremos 1900 y 2100');

-- CHECK y unique (como postgres; lo que falla no deja filas) --------------------------------
select throws_ok(
  $$insert into public.normativa (titulo, numero, anio, ruta_archivo)
    values ('   ', '700', 2020, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1.pdf')$$,
  '23514', null, 'CHECK: un titulo en blanco da 23514');
select throws_ok(
  $$insert into public.normativa (titulo, numero, anio, ruta_archivo)
    values ('Mal', '   ', 2020, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1.pdf')$$,
  '23514', null, 'CHECK: un numero en blanco da 23514');
select throws_ok(
  $$insert into public.normativa (titulo, numero, anio, ruta_archivo)
    values ('Mal', '700', 1899, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1.pdf')$$,
  '23514', null, 'CHECK: anio 1899 da 23514');
select throws_ok(
  $$insert into public.normativa (titulo, numero, anio, ruta_archivo)
    values ('Mal', '700', 2101, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1.pdf')$$,
  '23514', null, 'CHECK: anio 2101 da 23514');
select throws_ok(
  $$insert into public.normativa (titulo, numero, anio, ruta_archivo)
    values ('Mal', '700', 2020, null)$$,
  '23502', null, 'ruta_archivo es obligatoria (23502)');
select throws_ok(
  $$insert into public.normativa (titulo, numero, anio, ruta_archivo)
    values ('Mal', '  100/20 ', 2020, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1.pdf')$$,
  '23505', null, 'unique numero+anio: el mismo numero con espacios en los extremos da 23505');
select throws_ok(
  $$insert into public.normativa (titulo, numero, anio, ruta_archivo)
    values ('Mal', 'RESOLUCION 5 ', 2022, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1.pdf')$$,
  '23505', null, 'unique numero+anio: no distingue mayusculas ni tildes (RESOLUCION 5 = Resolución 5)');
select throws_ok(
  $$insert into public.normativa (titulo, numero, anio, ruta_archivo)
    values ('Mal', '700', 2020, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1.pdf')$$,
  '23505', null, 'ruta_archivo repetida da 23505');
select throws_ok(
  $$insert into public.normativa (titulo, numero, anio, ruta_archivo)
    values ('Mal', '700', 2020, 'mal.pdf')$$,
  '23514', null, 'CHECK: una ruta que no es <uuid>.pdf da 23514');
select throws_ok(
  $$insert into public.normativa (titulo, numero, anio, ruta_archivo)
    values ('Mal', '700', 2020, 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBB1.pdf')$$,
  '23514', null, 'CHECK: una ruta con mayusculas da 23514');
select throws_ok(
  $$insert into public.normativa (titulo, numero, anio, ruta_archivo)
    values ('Mal', '700', 2020, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1.docx')$$,
  '23514', null, 'CHECK: una ruta que no termina en .pdf da 23514');
select throws_ok(
  $$insert into public.normativa (titulo, numero, anio, ruta_archivo)
    values ('Mal', '700', 2020, 'carpeta/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1.pdf')$$,
  '23514', null, 'CHECK: una ruta con carpeta da 23514');

-- Privilegios de las funciones (como postgres) ------------------------------------------------
select ok(
  has_function_privilege('authenticated', 'public.guardar_normativa(text, text, text, smallint, text[], text, int)', 'execute'),
  'guardar_normativa: authenticated tiene EXECUTE');
select ok(
  not has_function_privilege('anon', 'public.guardar_normativa(text, text, text, smallint, text[], text, int)', 'execute'),
  'guardar_normativa: anon no tiene EXECUTE');
select ok(
  not (select prosecdef from pg_proc
        where oid = 'public.guardar_normativa(text, text, text, smallint, text[], text, int)'::regprocedure),
  'guardar_normativa es security invoker');
select ok(
  (select proconfig from pg_proc
    where oid = 'public.guardar_normativa(text, text, text, smallint, text[], text, int)'::regprocedure)
    @> array['search_path=""'],
  'guardar_normativa fija search_path vacio');

select ok(
  has_function_privilege('anon', 'public.contar_descarga_normativa(int)', 'execute'),
  'contar_descarga_normativa: anon tiene EXECUTE');
select ok(
  has_function_privilege('authenticated', 'public.contar_descarga_normativa(int)', 'execute'),
  'contar_descarga_normativa: authenticated tiene EXECUTE');
select is_empty(
  $$select 1 from pg_proc p, aclexplode(p.proacl) a
     where p.oid = 'public.contar_descarga_normativa(int)'::regprocedure
       and a.grantee = 0 and a.privilege_type = 'EXECUTE'$$,
  'contar_descarga_normativa: public no tiene EXECUTE');
select ok(
  (select prosecdef from pg_proc where oid = 'public.contar_descarga_normativa(int)'::regprocedure),
  'contar_descarga_normativa es security definer');
select ok(
  (select proconfig from pg_proc where oid = 'public.contar_descarga_normativa(int)'::regprocedure)
    @> array['search_path=""'],
  'contar_descarga_normativa fija search_path vacio');
select ok(
  (select prorettype from pg_proc where oid = 'public.contar_descarga_normativa(int)'::regprocedure) = 'void'::regtype,
  'contar_descarga_normativa devuelve void');

-- Bucket 'normativas' (como postgres) ----------------------------------------------------------
select results_eq(
  $$select public from storage.buckets where id = 'normativas'$$,
  array[true], 'bucket normativas: public = true');
select results_eq(
  $$select file_size_limit::bigint from storage.buckets where id = 'normativas'$$,
  array[20971520::bigint], 'bucket normativas: file_size_limit = 20971520 (20 MiB)');
select results_eq(
  $$select m::text from storage.buckets b, unnest(b.allowed_mime_types) as m where b.id = 'normativas'$$,
  array['application/pdf'], 'bucket normativas: allowed_mime_types es solo application/pdf');

select is_empty(
  $$select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and (coalesce(qual, '') like '%normativas%' or coalesce(with_check, '') like '%normativas%')
       and (roles::text[] && array['anon', 'public'] or cmd in ('UPDATE', 'ALL'))$$,
  'storage.objects: ninguna politica del bucket normativas para anon/public ni de update');
select results_eq(
  $$select p.cmd::text from pg_policies p
     where p.schemaname = 'storage' and p.tablename = 'objects'
       and (coalesce(p.qual, '') like '%normativas%' or coalesce(p.with_check, '') like '%normativas%')
       and p.roles = array['authenticated']::name[]
       and (coalesce(p.qual, '') like '%es_admin%' or coalesce(p.with_check, '') like '%es_admin%')
     order by 1$$,
  array['DELETE', 'INSERT', 'SELECT'],
  'storage.objects: el bucket normativas tiene politicas select, insert y delete solo para el admin');

-- resolver_etiquetas: privilegios ---------------------------------------------------------------
select ok(
  has_function_privilege('authenticated', 'public.resolver_etiquetas(text[])', 'execute'),
  'resolver_etiquetas: authenticated tiene EXECUTE');
select ok(
  not has_function_privilege('anon', 'public.resolver_etiquetas(text[])', 'execute'),
  'resolver_etiquetas: anon no tiene EXECUTE');

-- anon -------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select results_eq(
  $$select titulo::text from public.normativa order by titulo collate "C"$$,
  array['N 1900', 'N 2100', 'N Base', 'N Borrar', 'N Contador', 'N Otro Anio', 'N Tilde'],
  'anon: ve todas las normativas');
select results_eq(
  $$select count(*)::int from public.normativa_etiqueta$$,
  array[2], 'anon: ve el puente normativa_etiqueta');
select results_eq(
  $$select count(*)::int from public.etiqueta$$,
  array[2], 'anon: ve las etiquetas');
select throws_ok(
  $$insert into public.normativa (titulo, numero, anio, ruta_archivo)
    values ('Hack', '999', 2020, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2.pdf')$$,
  '42501', null, 'anon: INSERT en normativa da 42501');
select throws_ok(
  $$insert into public.normativa_etiqueta (normativa_id, etiqueta_id)
    values (current_setting('test.otro')::int, (select id from public.etiqueta where nombre = 'Etiq Base'))$$,
  '42501', null, 'anon: INSERT en normativa_etiqueta da 42501');
do $$
begin
  begin update public.normativa set titulo = 'hack'; exception when insufficient_privilege then null; end;
  begin delete from public.normativa; exception when insufficient_privilege then null; end;
  begin
    update public.normativa_etiqueta
       set etiqueta_id = (select id from public.etiqueta where nombre = 'Etiq Base')
     where etiqueta_id = current_setting('test.etiq_borrar')::int;
  exception when insufficient_privilege then null; end;
  begin delete from public.normativa_etiqueta; exception when insufficient_privilege then null; end;
end $$;
select throws_ok(
  $$select * from public.guardar_normativa(p_titulo => 'Hack', p_descripcion => null, p_numero => '999',
      p_anio => 2020::smallint, p_etiquetas => array[]::text[],
      p_ruta_archivo => 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2.pdf')$$,
  '42501', null, 'anon: guardar_normativa da 42501');
select throws_ok(
  $$select public.resolver_etiquetas(array['Hack'])$$,
  '42501', null, 'anon: resolver_etiquetas da 42501');
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'normativas'$$,
  array[0], 'anon: no lee objetos del bucket normativas por la API de tablas');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('normativas', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3.pdf', '{"size": 10}')$$,
  '42501', null, 'anon: INSERT en storage.objects del bucket normativas da 42501');

-- anon: contador
select lives_ok(
  $$select public.contar_descarga_normativa(current_setting('test.contador')::int)$$,
  'anon: contar_descarga_normativa funciona');
select lives_ok(
  $$select public.contar_descarga_normativa(999999)$$,
  'anon: contar_descarga_normativa con un id inexistente no falla');
reset role;

select results_eq(
  $$select titulo::text, descargas, descripcion is null from public.normativa
     where titulo in ('N Base', 'N Contador') order by titulo$$,
  $$values ('N Base'::text, 5, false), ('N Contador', 1, true)$$,
  'anon: el contador sube solo la normativa pedida y UPDATE/DELETE de anon no cambian ni borran nada');
select results_eq(
  $$select count(*)::int from public.normativa$$,
  array[7], 'anon: DELETE en normativa no borra nada');
select results_eq(
  $$select count(*)::int from public.normativa_etiqueta$$,
  array[2], 'anon: DELETE en normativa_etiqueta no borra nada');
select results_eq(
  $$select count(*)::int from public.normativa_etiqueta where etiqueta_id = current_setting('test.etiq_borrar')::int$$,
  array[1], 'anon: UPDATE en normativa_etiqueta no cambia la etiqueta de ninguna fila');
select results_eq(
  $$select count(*)::int from public.normativa where titulo = 'hack'$$,
  array[0], 'anon: UPDATE en normativa no cambia nada');
select results_eq(
  $$select updated_at = '2020-01-01'::timestamptz from public.normativa where titulo = 'N Contador'$$,
  array[true], 'el contador no cambia updated_at');
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'normativa' and operacion = 'UPDATE' and registro_id = current_setting('test.contador')$$,
  array[0], 'el contador no deja filas en registro_operacion');

-- authenticated sin marca de admin ------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"66666666-6666-6666-6666-666666666666","app_metadata":{}}';
select results_eq(
  $$select count(*)::int from public.normativa$$,
  array[7], 'sin marca: ve las normativas');
select throws_ok(
  $$insert into public.normativa (titulo, numero, anio, ruta_archivo)
    values ('Hack', '999', 2020, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2.pdf')$$,
  '42501', null, 'sin marca: INSERT en normativa da 42501');
select throws_ok(
  $$insert into public.normativa_etiqueta (normativa_id, etiqueta_id)
    values (current_setting('test.otro')::int, (select id from public.etiqueta where nombre = 'Etiq Base'))$$,
  '42501', null, 'sin marca: INSERT en normativa_etiqueta da 42501');
do $$
begin
  begin update public.normativa set titulo = 'hack'; exception when insufficient_privilege then null; end;
  begin delete from public.normativa; exception when insufficient_privilege then null; end;
  begin
    update public.normativa_etiqueta
       set etiqueta_id = (select id from public.etiqueta where nombre = 'Etiq Base')
     where etiqueta_id = current_setting('test.etiq_borrar')::int;
  exception when insufficient_privilege then null; end;
  begin delete from public.normativa_etiqueta; exception when insufficient_privilege then null; end;
end $$;
select throws_ok(
  $$select * from public.guardar_normativa(p_titulo => 'Hack', p_descripcion => null, p_numero => '999',
      p_anio => 2020::smallint, p_etiquetas => array[]::text[],
      p_ruta_archivo => 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2.pdf')$$,
  '42501', null, 'sin marca: guardar_normativa (alta) da 42501');
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'normativas'$$,
  array[0], 'sin marca: no lee objetos del bucket normativas');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('normativas', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3.pdf', '{"size": 10}')$$,
  '42501', null, 'sin marca: INSERT en storage.objects del bucket normativas da 42501');
reset role;
select results_eq(
  $$select count(*)::int from public.normativa where titulo = 'hack'$$,
  array[0], 'sin marca: UPDATE en normativa no cambia nada');
select results_eq(
  $$select count(*)::int from public.normativa$$,
  array[7], 'sin marca: DELETE en normativa no borra nada');
select results_eq(
  $$select count(*)::int from public.normativa_etiqueta$$,
  array[2], 'sin marca: DELETE en normativa_etiqueta no borra nada');
select results_eq(
  $$select count(*)::int from public.normativa_etiqueta where etiqueta_id = current_setting('test.etiq_borrar')::int$$,
  array[1], 'sin marca: UPDATE en normativa_etiqueta no cambia la etiqueta de ninguna fila');

-- admin: edicion directa de la tabla -----------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"66666666-6666-6666-6666-666666666666","app_metadata":{"admin":true}}';
select throws_ok(
  $$update public.normativa set descargas = 99 where titulo = 'N Contador'$$,
  '42501', null, 'admin: UPDATE de normativa.descargas da 42501 (solo la RPC la cambia)');
select lives_ok(
  $$update public.normativa set titulo = 'N Otro Anio v2', descripcion = 'nueva', numero = '101/20', anio = 2021,
      ruta_archivo = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8.pdf'
    where titulo = 'N Otro Anio'$$,
  'admin: UPDATE de titulo, descripcion, numero, anio y ruta_archivo funciona');
select lives_ok(
  $$update public.normativa set titulo = titulo where titulo = 'N Tilde'$$,
  'admin: UPDATE sin cambios funciona');
select lives_ok(
  $$select public.contar_descarga_normativa(current_setting('test.contador')::int)$$,
  'admin: contar_descarga_normativa funciona');

-- admin: guardar_normativa, alta ----------------------------------------------------------------
-- Comparte la etiqueta con un taller: guardar_taller y guardar_normativa resuelven con resolver_etiquetas.
select lives_ok(
  $$select public.guardar_taller(
      (select id from public.categoria where nombre = 'Cat Norm'), 'Taller Norm', 'd', 'BORRADOR'::public.estado_taller,
      array[]::smallint[], array['Compartida'])$$,
  'admin: guardar_taller crea la etiqueta Compartida');

do $$
declare r record;
begin
  select * into r from public.guardar_normativa(
    p_titulo => 'Alta RPC', p_descripcion => 'desc alta', p_numero => '  300/21  ', p_anio => 2021::smallint,
    p_etiquetas => array['  COMPARTIDA ', 'compartida', 'Otra Y', ''],
    p_ruta_archivo => 'cccccccc-cccc-cccc-cccc-ccccccccccc1.pdf');
  perform set_config('test.alta_id', r.id::text, true);
  perform set_config('test.alta_ant', coalesce(r.ruta_anterior, '<null>'), true);
end $$;

select ok(current_setting('test.alta_id')::int > 0, 'guardar_normativa (alta): devuelve el id');
select is(current_setting('test.alta_ant'), '<null>', 'guardar_normativa (alta): ruta_anterior es null');
select results_eq(
  $$select titulo::text, descripcion, numero::text, anio::int, ruta_archivo::text, descargas
      from public.normativa where id = current_setting('test.alta_id')::int$$,
  $$values ('Alta RPC'::text, 'desc alta'::text, '300/21'::text, 2021,
            'cccccccc-cccc-cccc-cccc-ccccccccccc1.pdf'::text, 0)$$,
  'guardar_normativa (alta): guarda la fila con el numero recortado y descargas en 0');
select results_eq(
  $$select e.nombre::text from public.normativa_etiqueta ne join public.etiqueta e on e.id = ne.etiqueta_id
     where ne.normativa_id = current_setting('test.alta_id')::int order by e.nombre$$,
  array['Compartida', 'Otra Y'],
  'guardar_normativa (alta): resuelve las etiquetas sin duplicados ni vacias, normalizadas');
select results_eq(
  $$select count(*)::int from public.etiqueta where lower(nombre) = 'compartida'$$,
  array[1], 'las etiquetas se comparten con talleres: no se duplica Compartida');
select results_eq(
  $$select count(*)::int
      from public.taller_etiqueta te join public.normativa_etiqueta ne on ne.etiqueta_id = te.etiqueta_id
     where ne.normativa_id = current_setting('test.alta_id')::int$$,
  array[1], 'el taller y la normativa apuntan a la misma fila de etiqueta');

-- Alta rechazada: duplicado, ruta nula, ruta mala (atomicas: no dejan etiquetas) -----------------
select throws_ok(
  $$select * from public.guardar_normativa(p_titulo => 'Dup', p_descripcion => null, p_numero => ' 300/21',
      p_anio => 2021::smallint, p_etiquetas => array['Etiqueta Fallida'],
      p_ruta_archivo => 'cccccccc-cccc-cccc-cccc-ccccccccccc2.pdf')$$,
  '23505', null, 'guardar_normativa: el mismo numero y anio (sin distinguir espacios) da 23505');
select throws_ok(
  $$select * from public.guardar_normativa(p_titulo => 'Dup', p_descripcion => null, p_numero => 'RESOLUCION 5',
      p_anio => 2022::smallint, p_etiquetas => array['Etiqueta Fallida'],
      p_ruta_archivo => 'cccccccc-cccc-cccc-cccc-ccccccccccc2.pdf')$$,
  '23505', null, 'guardar_normativa: el duplicado tampoco distingue mayusculas ni tildes');
select throws_ok(
  $$select * from public.guardar_normativa(p_titulo => 'Sin ruta', p_descripcion => null, p_numero => '301',
      p_anio => 2021::smallint, p_etiquetas => array['Etiqueta Fallida'])$$,
  '23502', null, 'guardar_normativa: un alta sin ruta_archivo da 23502');
select throws_ok(
  $$select * from public.guardar_normativa(p_titulo => 'Mala ruta', p_descripcion => null, p_numero => '302',
      p_anio => 2021::smallint, p_etiquetas => array['Etiqueta Fallida'], p_ruta_archivo => 'mala.pdf')$$,
  '23514', null, 'guardar_normativa: una ruta con formato invalido da 23514');
select results_eq(
  $$select count(*)::int from public.etiqueta where nombre = 'Etiqueta Fallida'$$,
  array[0], 'guardar_normativa es atomico: un alta rechazada no deja etiquetas');

-- admin: guardar_normativa, edicion --------------------------------------------------------------
-- 1) sin archivo (p_ruta_archivo null): conserva la ruta y el contador
do $$
declare r record;
begin
  select * into r from public.guardar_normativa(
    p_id => current_setting('test.base')::int,
    p_titulo => 'N Base v2', p_descripcion => 'desc v2', p_numero => ' 100/20 ', p_anio => 2020::smallint,
    p_etiquetas => array['Edit Tag'], p_ruta_archivo => null);
  perform set_config('test.e1_id', r.id::text, true);
  perform set_config('test.e1_ant', coalesce(r.ruta_anterior, '<null>'), true);
end $$;
select is(current_setting('test.e1_id'), current_setting('test.base'), 'guardar_normativa (edicion): devuelve el id editado');
select is(current_setting('test.e1_ant'), '<null>',
  'guardar_normativa (edicion sin archivo): ruta_anterior es null (no hay nada que borrar del bucket)');
select results_eq(
  $$select titulo::text, descripcion, numero::text, ruta_archivo::text, descargas
      from public.normativa where id = current_setting('test.base')::int$$,
  $$values ('N Base v2'::text, 'desc v2'::text, '100/20'::text, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1.pdf'::text, 5)$$,
  'guardar_normativa (edicion sin archivo): conserva ruta_archivo y descargas, recorta el numero');
select results_eq(
  $$select e.nombre::text from public.normativa_etiqueta ne join public.etiqueta e on e.id = ne.etiqueta_id
     where ne.normativa_id = current_setting('test.base')::int order by e.nombre$$,
  array['Edit Tag'], 'guardar_normativa (edicion): reemplaza las etiquetas del puente');

-- 2) con archivo nuevo: reemplaza la ruta, devuelve la anterior y conserva el contador
do $$
declare r record;
begin
  select * into r from public.guardar_normativa(
    p_id => current_setting('test.base')::int,
    p_titulo => 'N Base v2', p_descripcion => 'desc v2', p_numero => '100/20', p_anio => 2020::smallint,
    p_etiquetas => array['Edit Tag', 'Etiq Base'], p_ruta_archivo => 'cccccccc-cccc-cccc-cccc-ccccccccccc3.pdf');
  perform set_config('test.e2_ant', coalesce(r.ruta_anterior, '<null>'), true);
end $$;
select is(current_setting('test.e2_ant'), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1.pdf',
  'guardar_normativa (reemplazo): devuelve la ruta anterior para que el cliente la borre');
select results_eq(
  $$select ruta_archivo::text, descargas from public.normativa where id = current_setting('test.base')::int$$,
  $$values ('cccccccc-cccc-cccc-cccc-ccccccccccc3.pdf'::text, 5)$$,
  'guardar_normativa (reemplazo): guarda la ruta nueva y conserva descargas');
select results_eq(
  $$select count(*)::int from public.normativa_etiqueta where normativa_id = current_setting('test.base')::int$$,
  array[2], 'guardar_normativa (edicion): suma las etiquetas nuevas al puente');

-- 3) sin cambios: igual se audita
select lives_ok(
  $$select * from public.guardar_normativa(
      p_id => current_setting('test.base')::int,
      p_titulo => 'N Base v2', p_descripcion => 'desc v2', p_numero => '100/20', p_anio => 2020::smallint,
      p_etiquetas => array['Edit Tag', 'Etiq Base'])$$,
  'guardar_normativa: un guardado sin cambios (sin archivo) funciona');

-- 4) con la misma ruta que ya tiene: tampoco hay nada que borrar
do $$
declare r record;
begin
  select * into r from public.guardar_normativa(
    p_id => current_setting('test.base')::int,
    p_titulo => 'N Base v2', p_descripcion => 'desc v2', p_numero => '100/20', p_anio => 2020::smallint,
    p_etiquetas => array['Edit Tag', 'Etiq Base'], p_ruta_archivo => 'cccccccc-cccc-cccc-cccc-ccccccccccc3.pdf');
  perform set_config('test.e4_ant', coalesce(r.ruta_anterior, '<null>'), true);
end $$;
select is(current_setting('test.e4_ant'), '<null>',
  'guardar_normativa (edicion con la misma ruta): ruta_anterior es null');

-- Errores de edicion
select throws_ok(
  $$select * from public.guardar_normativa(
      p_id => current_setting('test.base')::int,
      p_titulo => 'N Base v2', p_descripcion => null, p_numero => 'resolucion 5', p_anio => 2022::smallint,
      p_etiquetas => array[]::text[])$$,
  '23505', null, 'guardar_normativa (edicion): tomar el numero y anio de otra normativa da 23505');
select throws_ok(
  $$select * from public.guardar_normativa(
      p_id => 999999,
      p_titulo => 'X', p_descripcion => null, p_numero => '888', p_anio => 2020::smallint,
      p_etiquetas => array[]::text[])$$,
  'P0002', null, 'guardar_normativa (edicion): un id inexistente da P0002');

-- Resolver con las etiquetas de un taller: la misma etiqueta sirve a ambas
select lives_ok(
  $$select public.guardar_taller(
      (select id from public.categoria where nombre = 'Cat Norm'), 'Taller Norm', 'd', 'BORRADOR'::public.estado_taller,
      array[]::smallint[], array['compartida', 'Otra Y'],
      (select id from public.taller where nombre = 'Taller Norm'))$$,
  'admin: guardar_taller reutiliza las etiquetas creadas por una normativa');
select results_eq(
  $$select count(*)::int from public.etiqueta where lower(nombre) in ('compartida', 'otra y')$$,
  array[2], 'taller y normativa comparten las etiquetas: no hay duplicados');

-- admin: baja fisica de una normativa con etiquetas ------------------------------------------------
select lives_ok(
  $$delete from public.normativa where id = current_setting('test.borrar')::int$$,
  'admin: DELETE de una normativa con etiquetas funciona');
select results_eq(
  $$select (select count(*)::int from public.normativa where id = current_setting('test.borrar')::int),
          (select count(*)::int from public.normativa_etiqueta where normativa_id = current_setting('test.borrar')::int),
          (select count(*)::int from public.etiqueta where id = current_setting('test.etiq_borrar')::int)$$,
  $$values (0, 0, 1)$$,
  'la baja borra la fila y su puente, pero la etiqueta queda');

-- admin: Storage ----------------------------------------------------------------------------------
select lives_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('normativas', 'dddddddd-dddd-dddd-dddd-ddddddddddd1.pdf', '{"size": 10}')$$,
  'admin: INSERT en storage.objects del bucket normativas funciona');
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'normativas'$$,
  array[1], 'admin: lee los objetos del bucket normativas');
update storage.objects set name = 'dddddddd-dddd-dddd-dddd-ddddddddddd2.pdf' where bucket_id = 'normativas';
select results_eq(
  $$select name::text from storage.objects where bucket_id = 'normativas'$$,
  array['dddddddd-dddd-dddd-dddd-ddddddddddd1.pdf'], 'admin: UPDATE en storage.objects no cambia nada (sin politica de update)');
reset role;

-- Storage: DELETE (ver recursos.test.sql: allow_delete_query y la politica de select temporal) --------
set local storage.allow_delete_query = 'true';
create policy zz_select_temporal on storage.objects for select to authenticated using (bucket_id = 'normativas');

set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"66666666-6666-6666-6666-666666666666","app_metadata":{}}';
delete from storage.objects where bucket_id = 'normativas';
reset role;
drop policy zz_select_temporal on storage.objects;
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'normativas'$$,
  array[1], 'sin marca: DELETE en storage.objects del bucket normativas no borra nada');

set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"66666666-6666-6666-6666-666666666666","app_metadata":{"admin":true}}';
delete from storage.objects where bucket_id = 'normativas';
reset role;
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'normativas'$$,
  array[0], 'admin: DELETE en storage.objects del bucket normativas borra el objeto');

-- Auditoria y updated_at (como postgres) ---------------------------------------------------------------
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'normativa' and operacion = 'INSERT' and registro_id = current_setting('test.alta_id')
       and usuario_id = '66666666-6666-6666-6666-666666666666'$$,
  array[1], 'el alta (guardar_normativa) deja una fila INSERT con el usuario_id del admin');
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'normativa' and operacion = 'UPDATE' and registro_id = current_setting('test.base')
       and usuario_id = '66666666-6666-6666-6666-666666666666'$$,
  array[4], 'cada edicion deja una fila UPDATE, tambien la que no cambia nada (4 guardados)');
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'normativa' and operacion = 'UPDATE' and registro_id = current_setting('test.tilde')
       and usuario_id = '66666666-6666-6666-6666-666666666666'$$,
  array[1], 'un UPDATE directo sin cambios tambien se audita');
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'normativa' and operacion = 'UPDATE' and registro_id = current_setting('test.otro')
       and usuario_id = '66666666-6666-6666-6666-666666666666'$$,
  array[1], 'un UPDATE directo con cambios se audita una vez');
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'normativa' and operacion = 'DELETE' and registro_id = current_setting('test.borrar')
       and datos_anteriores ->> 'titulo' = 'N Borrar'
       and usuario_id = '66666666-6666-6666-6666-666666666666'$$,
  array[1], 'el DELETE deja una fila con los datos anteriores y el usuario_id del admin');
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'normativa' and operacion = 'UPDATE' and registro_id = current_setting('test.contador')$$,
  array[0], 'el contador (anon y admin) no deja ninguna fila UPDATE en registro_operacion');
select results_eq(
  $$select descargas, updated_at = '2020-01-01'::timestamptz from public.normativa
     where id = current_setting('test.contador')::int$$,
  $$values (2, true)$$, 'el contador sumo 2 (anon y admin) sin cambiar updated_at');
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'normativa' and operacion = 'UPDATE'
       and registro_id = (select id::text from public.normativa where titulo = 'N 1900')
       and usuario_id is null
       and (datos_anteriores ->> 'descargas')::int = 0 and (datos_nuevos ->> 'descargas')::int = 7$$,
  array[1], 'un UPDATE de un rol con bypass que cambia descargas y otra columna se audita');
select results_eq(
  $$select descargas, descripcion, updated_at > '2020-01-02'::timestamptz from public.normativa where titulo = 'N 1900'$$,
  $$values (7, 'cambio con bypass'::text, true)$$,
  'ese UPDATE con bypass tambien mueve updated_at');
select results_eq(
  $$select titulo::text, updated_at > '2020-01-02'::timestamptz from public.normativa
     where id in (current_setting('test.base')::int, current_setting('test.tilde')::int,
                  current_setting('test.otro')::int)
     order by titulo$$,
  $$values ('N Base v2'::text, true), ('N Otro Anio v2', true), ('N Tilde', true)$$,
  'toda edicion, incluida la que no cambia nada, actualiza updated_at');

select * from finish();
rollback;
