-- Corte descargas, fase A (criterios 5, 6, 7 y 8 de docs/specs/descargas/spec.md; ADR 0022): enum tipo_institucion, tabla
-- registro_descarga, RPC registrar_descarga() y la politica talleres_select_anon de storage.objects. No depende del seed: el
-- usuario de prueba se crea dentro de la transaccion (rollback al final).
--
-- CONTRATO (lo que debe cumplir la migracion; el test llama por nombre):
--
--   create type public.tipo_institucion as enum ('PADRON', 'OTRA', 'SIN_INSTITUCION');
--
--   public.registro_descarga (sin updated_at):
--     id bigint identity PK, taller_id int not null FK taller, cargo varchar(30) not null, cargo_otro varchar(100),
--     localidad_id smallint not null FK localidad, institucion_tipo tipo_institucion not null,
--     establecimiento_id int FK establecimiento, institucion_otra varchar(200), fecha_hora timestamptz not null default now().
--     FK sin cascada. Indice por taller_id.
--     CHECK de cargo: Director/a, Vicedirector/a, Secretario/a, Docente, Supervisor/a u Otro.
--     CHECK: cargo_otro y institucion_otra son no vacios y sin espacios en los extremos, y existen <=> cargo = 'Otro' / tipo = 'OTRA'.
--     CHECK institucion_coherente: PADRON => hay establecimiento y no hay otra; OTRA => hay otra (el id puede estar: se completa al
--     vincular); SIN_INSTITUCION => ninguno de los dos.
--     RLS: select solo es_admin(). Sin grants de escritura para anon ni authenticated.
--     Trigger auditar() solo `after update or delete` (el INSERT no se audita: la tabla es el registro de un hecho anonimo, 0022).
--
--   public.registrar_descarga(p_taller_id int, p_cargo text, p_localidad_id smallint, p_institucion_tipo tipo_institucion,
--       p_cargo_otro text default null, p_establecimiento_id int default null, p_institucion_otra text default null) returns void
--     security definer, search_path = '', sin EXECUTE para public, con EXECUTE para anon y authenticated.
--     1. Normaliza segun el discriminador: cargo_otro solo con 'Otro', institucion_otra solo con OTRA, establecimiento_id solo con
--        PADRON; recorta (btrim) y convierte lo vacio en null. Despues deja que los CHECK validen (un 'Otro' en blanco da 23514).
--     2. El taller debe existir y estar PUBLICADO (comprobacion explicita, la funcion saltea la RLS): si no, DA003.
--     3. Con PADRON, el establecimiento debe existir, estar activo y ser de p_localidad_id: si no, DA004.
--     4. Con sesion de admin (es_admin()) vuelve sin insertar, despues de DA003 y DA004 (#25: los CHECK no se evaluan para el
--        admin). En cualquier otro caso inserta.
--
--   Politica de storage.objects: talleres_select_anon, for select to anon,
--     using (bucket_id = 'talleres' and exists (select 1 from public.recurso r where r.ruta_archivo = objects.name)).
--
-- Notas de diseno del test:
-- - Despues de `reset role` el claim sigue puesto y auditar() hace que postgres no escriba mientras haya claims: todo el
--   soporte de escritura como postgres y la prueba de auditoria van al principio.
-- - UPDATE y DELETE sin permiso dan 42501 (no hay grant), como en padron.test.sql.
-- - Las filas se identifican por marcas propias (localidad o cargo) para no depender del orden.
begin;
create extension if not exists pgtap with schema extensions;
select plan(98);

-- Soporte del test (como postgres) ---------------------------------------------
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777',
        'authenticated', 'authenticated', 'descargas-admin@test.local');

insert into public.categoria (nivel_id, nombre, descripcion, activo) values (1, 'Cat Desc', 'base', true);

insert into public.taller (categoria_id, nombre, descripcion, estado, created_at, updated_at)
select c.id, v.nombre, 'd', v.estado::public.estado_taller, '2020-01-01', '2020-01-01'
  from public.categoria c,
       (values ('D Pub', 'PUBLICADO'), ('D Bor', 'BORRADOR'), ('D Ina', 'INACTIVO')) as v(nombre, estado)
 where c.nombre = 'Cat Desc';

insert into public.establecimiento (cue, nombre, localidad_id, activo)
values ('9001', 'Desc Activa A', 1, true),
       ('9002', 'Desc Inactiva B', 1, false),
       ('9003', 'Desc Activa C', 2, true);

-- Un recurso-archivo por taller y sus objetos en el bucket: el de cada taller con fila, un huerfano (sin fila) del publicado y
-- un objeto del bucket 'normativas' con el mismo nombre que el recurso del publicado (otro bucket: no cuenta).
insert into public.recurso (taller_id, nombre, tipo, ruta_archivo, url, tamanio_bytes, orden)
select t.id, 'Rec ' || t.nombre, 'PDF'::public.tipo_recurso, t.id::text || '/a.pdf', null, 100, 1
  from public.taller t where t.nombre in ('D Pub', 'D Bor', 'D Ina');

insert into storage.objects (bucket_id, name, metadata)
select 'talleres', t.id::text || '/a.pdf', '{"size": 100}'::jsonb from public.taller t where t.nombre in ('D Pub', 'D Bor', 'D Ina')
union all
select 'talleres', t.id::text || '/huerfano.pdf', '{"size": 100}'::jsonb from public.taller t where t.nombre = 'D Pub'
union all
select 'normativas', t.id::text || '/a.pdf', '{"size": 100}'::jsonb from public.taller t where t.nombre = 'D Pub';

do $$
begin
  perform set_config('test.t_pub', (select id::text from public.taller where nombre = 'D Pub'), true);
  perform set_config('test.t_bor', (select id::text from public.taller where nombre = 'D Bor'), true);
  perform set_config('test.t_ina', (select id::text from public.taller where nombre = 'D Ina'), true);
  perform set_config('test.est_a', (select id::text from public.establecimiento where cue = '9001'), true);
  perform set_config('test.est_b', (select id::text from public.establecimiento where cue = '9002'), true);
  perform set_config('test.est_c', (select id::text from public.establecimiento where cue = '9003'), true);
end $$;

-- Filas de soporte: dos 'Supervisor/a' (las ve el admin) y una 'Vicedirector/a' que se actualiza y se borra mas abajo.
insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo)
values (current_setting('test.t_pub')::int, 'Supervisor/a', 1, 'SIN_INSTITUCION'),
       (current_setting('test.t_pub')::int, 'Supervisor/a', 2, 'SIN_INSTITUCION');
insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo)
values (current_setting('test.t_pub')::int, 'Vicedirector/a', 1, 'SIN_INSTITUCION');
do $$
begin
  perform set_config('test.aud', (select id::text from public.registro_descarga where cargo = 'Vicedirector/a'), true);
end $$;

-- Estructura (como postgres) ----------------------------------------------------
select has_table('public', 'registro_descarga', 'existe la tabla registro_descarga');
select hasnt_column('public', 'registro_descarga', 'updated_at', 'registro_descarga no tiene updated_at');

select enum_has_labels('public', 'tipo_institucion', array['PADRON', 'OTRA', 'SIN_INSTITUCION'],
  'tipo_institucion tiene PADRON, OTRA y SIN_INSTITUCION');

select results_eq(
  $$select column_name::text collate "default", data_type::text collate "default", character_maximum_length::int,
           is_nullable::text collate "default"
      from information_schema.columns
     where table_schema = 'public' and table_name = 'registro_descarga' order by column_name$$,
  $$values
    ('cargo'::text, 'character varying'::text, 30::int, 'NO'::text),
    ('cargo_otro', 'character varying', 100, 'YES'),
    ('establecimiento_id', 'integer', null, 'YES'),
    ('fecha_hora', 'timestamp with time zone', null, 'NO'),
    ('id', 'bigint', null, 'NO'),
    ('institucion_otra', 'character varying', 200, 'YES'),
    ('institucion_tipo', 'USER-DEFINED', null, 'NO'),
    ('localidad_id', 'smallint', null, 'NO'),
    ('taller_id', 'integer', null, 'NO')$$,
  'registro_descarga tiene las columnas, tipos y nulabilidad de la definicion 8.3');

select ok(
  (select fecha_hora is not null and fecha_hora <= now() from public.registro_descarga where id = current_setting('test.aud')::bigint),
  'fecha_hora se completa sola');

select results_eq(
  $$select confdeltype::text from pg_constraint
     where conrelid = 'public.registro_descarga'::regclass and contype = 'f' order by confrelid::regclass::text$$,
  array['a', 'a', 'a'],
  'las tres FK (establecimiento, localidad, taller) son sin cascada');

select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'registro_descarga'
             and indexdef like '%(taller_id)%'),
  'hay un indice por taller_id');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.registro_descarga'::regclass),
  'registro_descarga tiene RLS habilitada');

select results_eq(
  $$select cmd::text from pg_policies where schemaname = 'public' and tablename = 'registro_descarga'$$,
  array['SELECT'], 'registro_descarga tiene solo una politica, de SELECT');
select ok(
  (select qual like '%es_admin%' from pg_policies where schemaname = 'public' and tablename = 'registro_descarga'),
  'la politica de SELECT exige es_admin()');

-- Auditoria (criterio 8), como postgres sin claims --------------------------------
select results_eq(
  $$select (bit_or(t.tgtype) & 28)::int from pg_trigger t
     where t.tgrelid = 'public.registro_descarga'::regclass and not t.tgisinternal
       and t.tgfoid = to_regproc('public.auditar')$$,
  array[24], 'auditar() en registro_descarga cubre UPDATE (16) y DELETE (8), no INSERT (4)');

select results_eq(
  $$select count(*)::int from public.registro_operacion where tabla = 'registro_descarga'$$,
  array[0], 'los inserts de soporte (tres filas) no escribieron en registro_operacion');

update public.registro_descarga set cargo = 'Director/a' where id = current_setting('test.aud')::bigint;
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'registro_descarga' and operacion = 'UPDATE' and registro_id = current_setting('test.aud')$$,
  array[1], 'un UPDATE como postgres se audita');

delete from public.registro_descarga where id = current_setting('test.aud')::bigint;
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'registro_descarga' and operacion = 'DELETE' and registro_id = current_setting('test.aud')$$,
  array[1], 'un DELETE como postgres se audita');

-- CHECK de cargo e institucion (como postgres) --------------------------------------
select lives_ok(
  $$insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo)
    values (current_setting('test.t_pub')::int, 'Docente', 1, 'SIN_INSTITUCION')$$,
  'CHECK: Docente sin institucion es valido');
select lives_ok(
  $$insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo, establecimiento_id)
    values (current_setting('test.t_pub')::int, 'Director/a', 1, 'PADRON', current_setting('test.est_a')::int)$$,
  'CHECK: PADRON con establecimiento es valido');
select lives_ok(
  $$insert into public.registro_descarga (taller_id, cargo, cargo_otro, localidad_id, institucion_tipo, institucion_otra)
    values (current_setting('test.t_pub')::int, 'Otro', 'Bibliotecaria', 1, 'OTRA', 'Escuela Nueva')$$,
  'CHECK: Otro con cargo_otro y OTRA con institucion_otra es valido');
select lives_ok(
  $$insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo, establecimiento_id, institucion_otra)
    values (current_setting('test.t_pub')::int, 'Docente', 1, 'OTRA', current_setting('test.est_a')::int, 'Ya vinculada')$$,
  'CHECK: OTRA con institucion_otra y establecimiento (vinculada) es valido');

select throws_ok(
  $$insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo)
    values (current_setting('test.t_pub')::int, 'Ministro', 1, 'SIN_INSTITUCION')$$,
  '23514', null, 'CHECK: un cargo fuera de la lista da 23514');
select throws_ok(
  $$insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo)
    values (current_setting('test.t_pub')::int, 'Otro', 1, 'SIN_INSTITUCION')$$,
  '23514', null, 'CHECK: Otro sin cargo_otro da 23514');
select throws_ok(
  $$insert into public.registro_descarga (taller_id, cargo, cargo_otro, localidad_id, institucion_tipo)
    values (current_setting('test.t_pub')::int, 'Otro', '', 1, 'SIN_INSTITUCION')$$,
  '23514', null, 'CHECK: Otro con cargo_otro vacio da 23514');
select throws_ok(
  $$insert into public.registro_descarga (taller_id, cargo, cargo_otro, localidad_id, institucion_tipo)
    values (current_setting('test.t_pub')::int, 'Otro', '   ', 1, 'SIN_INSTITUCION')$$,
  '23514', null, 'CHECK: Otro con cargo_otro en blanco da 23514');
select throws_ok(
  $$insert into public.registro_descarga (taller_id, cargo, cargo_otro, localidad_id, institucion_tipo)
    values (current_setting('test.t_pub')::int, 'Otro', ' Bibliotecaria ', 1, 'SIN_INSTITUCION')$$,
  '23514', null, 'CHECK: cargo_otro con espacios en los extremos da 23514');
select throws_ok(
  $$insert into public.registro_descarga (taller_id, cargo, cargo_otro, localidad_id, institucion_tipo)
    values (current_setting('test.t_pub')::int, 'Docente', 'algo', 1, 'SIN_INSTITUCION')$$,
  '23514', null, 'CHECK: cargo_otro con un cargo que no es Otro da 23514');

select throws_ok(
  $$insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo)
    values (current_setting('test.t_pub')::int, 'Docente', 1, 'PADRON')$$,
  '23514', null, 'CHECK: PADRON sin establecimiento da 23514');
select throws_ok(
  $$insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo, establecimiento_id, institucion_otra)
    values (current_setting('test.t_pub')::int, 'Docente', 1, 'PADRON', current_setting('test.est_a')::int, 'Otra')$$,
  '23514', null, 'CHECK: PADRON con institucion_otra da 23514');
select throws_ok(
  $$insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo)
    values (current_setting('test.t_pub')::int, 'Docente', 1, 'OTRA')$$,
  '23514', null, 'CHECK: OTRA sin institucion_otra da 23514');
select throws_ok(
  $$insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo, institucion_otra)
    values (current_setting('test.t_pub')::int, 'Docente', 1, 'OTRA', '')$$,
  '23514', null, 'CHECK: OTRA con institucion_otra vacia da 23514');
select throws_ok(
  $$insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo, institucion_otra)
    values (current_setting('test.t_pub')::int, 'Docente', 1, 'OTRA', ' Escuela ')$$,
  '23514', null, 'CHECK: institucion_otra con espacios en los extremos da 23514');
select throws_ok(
  $$insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo, establecimiento_id)
    values (current_setting('test.t_pub')::int, 'Docente', 1, 'SIN_INSTITUCION', current_setting('test.est_a')::int)$$,
  '23514', null, 'CHECK: SIN_INSTITUCION con establecimiento da 23514');
select throws_ok(
  $$insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo, institucion_otra)
    values (current_setting('test.t_pub')::int, 'Docente', 1, 'SIN_INSTITUCION', 'Escuela')$$,
  '23514', null, 'CHECK: SIN_INSTITUCION con institucion_otra da 23514');

-- Longitudes: el varchar(n) corta antes que el CHECK (22001) ----------------------------
select throws_ok(
  format($$insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo)
           values (%s, %L, 1, 'SIN_INSTITUCION')$$, current_setting('test.t_pub'), repeat('x', 31)),
  '22001', null, 'cargo de 31 caracteres da 22001');
select throws_ok(
  format($$insert into public.registro_descarga (taller_id, cargo, cargo_otro, localidad_id, institucion_tipo)
           values (%s, 'Otro', %L, 1, 'SIN_INSTITUCION')$$, current_setting('test.t_pub'), repeat('x', 101)),
  '22001', null, 'cargo_otro de 101 caracteres da 22001');
select throws_ok(
  format($$insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo, institucion_otra)
           values (%s, 'Docente', 1, 'OTRA', %L)$$, current_setting('test.t_pub'), repeat('x', 201)),
  '22001', null, 'institucion_otra de 201 caracteres da 22001');
select lives_ok(
  format($$insert into public.registro_descarga (taller_id, cargo, cargo_otro, localidad_id, institucion_tipo, institucion_otra)
           values (%s, 'Otro', %L, 1, 'OTRA', %L)$$, current_setting('test.t_pub'), repeat('x', 100), repeat('y', 200)),
  'los maximos (100 y 200 caracteres) son validos');

-- FK -------------------------------------------------------------------------------------
select throws_ok(
  $$insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo)
    values (999999, 'Docente', 1, 'SIN_INSTITUCION')$$,
  '23503', null, 'FK: un taller inexistente da 23503');
select throws_ok(
  $$insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo)
    values (current_setting('test.t_pub')::int, 'Docente', 999, 'SIN_INSTITUCION')$$,
  '23503', null, 'FK: una localidad inexistente da 23503');
select throws_ok(
  $$insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo, establecimiento_id)
    values (current_setting('test.t_pub')::int, 'Docente', 1, 'PADRON', 999999)$$,
  '23503', null, 'FK: un establecimiento inexistente da 23503');

-- Privilegios de la RPC (como postgres) ------------------------------------------------------
select ok(
  has_function_privilege('anon', 'public.registrar_descarga(int, text, smallint, public.tipo_institucion, text, int, text)', 'execute'),
  'registrar_descarga: anon tiene EXECUTE');
select ok(
  has_function_privilege('authenticated', 'public.registrar_descarga(int, text, smallint, public.tipo_institucion, text, int, text)', 'execute'),
  'registrar_descarga: authenticated tiene EXECUTE');
select is_empty(
  $$select 1 from pg_proc p, aclexplode(p.proacl) a
     where p.oid = 'public.registrar_descarga(int, text, smallint, public.tipo_institucion, text, int, text)'::regprocedure
       and a.grantee = 0 and a.privilege_type = 'EXECUTE'$$,
  'registrar_descarga: public no tiene EXECUTE');
select ok(
  (select prosecdef from pg_proc
    where oid = 'public.registrar_descarga(int, text, smallint, public.tipo_institucion, text, int, text)'::regprocedure),
  'registrar_descarga es security definer');
select ok(
  (select proconfig from pg_proc
    where oid = 'public.registrar_descarga(int, text, smallint, public.tipo_institucion, text, int, text)'::regprocedure)
    @> array['search_path=""'],
  'registrar_descarga fija search_path vacio');
select ok(
  (select prorettype from pg_proc
    where oid = 'public.registrar_descarga(int, text, smallint, public.tipo_institucion, text, int, text)'::regprocedure) = 'void'::regtype,
  'registrar_descarga devuelve void');
select results_eq(
  $$select array_to_string(proargnames, ',')::text collate "default" from pg_proc
     where oid = 'public.registrar_descarga(int, text, smallint, public.tipo_institucion, text, int, text)'::regprocedure$$,
  $$values ('p_taller_id,p_cargo,p_localidad_id,p_institucion_tipo,p_cargo_otro,p_establecimiento_id,p_institucion_otra'::text)$$,
  'registrar_descarga tiene los parametros del contrato');
select results_eq(
  $$select pronargdefaults::int from pg_proc
     where oid = 'public.registrar_descarga(int, text, smallint, public.tipo_institucion, text, int, text)'::regprocedure$$,
  array[3], 'los tres ultimos parametros tienen valor por defecto');

-- Politica de storage (como postgres) -----------------------------------------------------------
select results_eq(
  $$select cmd::text collate "default", roles::text collate "default" from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname = 'talleres_select_anon'$$,
  $$values ('SELECT'::text, '{anon}'::text)$$,
  'existe la politica talleres_select_anon: SELECT solo para anon');

-- anon: tabla ------------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo)
    values (current_setting('test.t_pub')::int, 'Docente', 1, 'SIN_INSTITUCION')$$,
  '42501', null, 'anon: INSERT directo en registro_descarga da 42501');
select throws_ok(
  $$update public.registro_descarga set cargo = 'Docente'$$,
  '42501', null, 'anon: UPDATE en registro_descarga da 42501');
select throws_ok(
  $$delete from public.registro_descarga$$,
  '42501', null, 'anon: DELETE en registro_descarga da 42501');
do $$
begin
  begin
    perform set_config('test.anon_ve', (select count(*)::text from public.registro_descarga), true);
  exception when insufficient_privilege then
    perform set_config('test.anon_ve', '0', true);
  end;
end $$;
select is(current_setting('test.anon_ve'), '0', 'anon: no lee registro_descarga');

-- anon: storage ------------------------------------------------------------------------------
select results_eq(
  $$select name::text from storage.objects where bucket_id = 'talleres' order by name$$,
  format($$values (%L::text)$$, current_setting('test.t_pub') || '/a.pdf')::text,
  'anon: de storage.objects del bucket talleres ve solo el objeto del recurso de un taller publicado');
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'talleres' and name = current_setting('test.t_bor') || '/a.pdf'$$,
  array[0], 'anon: no ve el objeto del recurso de un taller en borrador');
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'talleres' and name = current_setting('test.t_ina') || '/a.pdf'$$,
  array[0], 'anon: no ve el objeto del recurso de un taller inactivo');
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'talleres' and name = current_setting('test.t_pub') || '/huerfano.pdf'$$,
  array[0], 'anon: no ve un objeto huerfano (sin fila en recurso) aunque sea de un taller publicado');
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'normativas'$$,
  array[0], 'anon: la politica no abre otros buckets aunque el nombre coincida con el de un recurso');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('talleres', current_setting('test.t_pub') || '/hack.pdf', '{"size": 10}')$$,
  '42501', null, 'anon: INSERT en storage.objects del bucket talleres da 42501');

-- anon: RPC ------------------------------------------------------------------------------------
select lives_ok(
  format($$select public.registrar_descarga(p_taller_id => %s, p_cargo => 'Docente', p_localidad_id => 1::smallint,
             p_institucion_tipo => 'PADRON', p_establecimiento_id => %s)$$,
         current_setting('test.t_pub'), current_setting('test.est_a')),
  'anon: registrar_descarga con un establecimiento activo de la localidad funciona');
select lives_ok(
  format($$select public.registrar_descarga(p_taller_id => %s, p_cargo => 'Director/a', p_localidad_id => 1::smallint,
             p_institucion_tipo => 'OTRA', p_establecimiento_id => %s, p_institucion_otra => '  Escuela X  ')$$,
         current_setting('test.t_pub'), current_setting('test.est_a')),
  'anon: OTRA con un id residual y el nombre con espacios funciona (se normaliza)');
select lives_ok(
  format($$select public.registrar_descarga(p_taller_id => %s, p_cargo => 'Docente', p_localidad_id => 3::smallint,
             p_institucion_tipo => 'SIN_INSTITUCION', p_cargo_otro => 'residual', p_establecimiento_id => %s,
             p_institucion_otra => 'residual')$$,
         current_setting('test.t_pub'), current_setting('test.est_a')),
  'anon: Docente con cargo_otro y SIN_INSTITUCION con id y nombre residuales funciona (se normaliza)');
select lives_ok(
  format($$select public.registrar_descarga(p_taller_id => %s, p_cargo => 'Otro', p_localidad_id => 4::smallint,
             p_institucion_tipo => 'SIN_INSTITUCION', p_cargo_otro => '  Bibliotecaria  ')$$,
         current_setting('test.t_pub')),
  'anon: Otro con el cargo escrito con espacios funciona (se recorta)');
select lives_ok(
  format($$select public.registrar_descarga(p_taller_id => %s, p_cargo => 'Secretario/a', p_localidad_id => 1::smallint,
             p_institucion_tipo => 'PADRON', p_establecimiento_id => %s, p_institucion_otra => 'residual')$$,
         current_setting('test.t_pub'), current_setting('test.est_a')),
  'anon: PADRON con institucion_otra residual funciona (se anula)');
select lives_ok(
  format($$select public.registrar_descarga(p_taller_id => %s, p_cargo => 'Docente', p_localidad_id => 6::smallint,
             p_institucion_tipo => 'OTRA', p_establecimiento_id => %s, p_institucion_otra => 'Con id inactivo')$$,
         current_setting('test.t_pub'), current_setting('test.est_b')),
  'anon: DA004 no aplica fuera de PADRON: OTRA con un id inactivo funciona (el id se anula)');

select throws_ok(
  format($$select public.registrar_descarga(p_taller_id => %s, p_cargo => 'Otro', p_localidad_id => 1::smallint,
             p_institucion_tipo => 'SIN_INSTITUCION', p_cargo_otro => '   ')$$, current_setting('test.t_pub')),
  '23514', null, 'anon: Otro con el cargo en blanco da 23514 (se anula y los CHECK validan)');
select throws_ok(
  format($$select public.registrar_descarga(p_taller_id => %s, p_cargo => 'Docente', p_localidad_id => 1::smallint,
             p_institucion_tipo => 'OTRA', p_institucion_otra => '   ')$$, current_setting('test.t_pub')),
  '23514', null, 'anon: OTRA con el nombre en blanco da 23514');
select throws_ok(
  format($$select public.registrar_descarga(p_taller_id => %s, p_cargo => 'Ministro', p_localidad_id => 1::smallint,
             p_institucion_tipo => 'SIN_INSTITUCION')$$, current_setting('test.t_pub')),
  '23514', null, 'anon: un cargo fuera de la lista da 23514');
select throws_ok(
  format($$select public.registrar_descarga(p_taller_id => %s, p_cargo => 'Docente', p_localidad_id => 1::smallint,
             p_institucion_tipo => 'PADRON')$$, current_setting('test.t_pub')),
  '23514', null, 'anon: PADRON sin establecimiento da 23514');

select throws_ok(
  $$select public.registrar_descarga(p_taller_id => 999999, p_cargo => 'Docente', p_localidad_id => 1::smallint,
      p_institucion_tipo => 'SIN_INSTITUCION')$$,
  'DA003', null, 'anon: un taller inexistente da DA003');
select throws_ok(
  format($$select public.registrar_descarga(p_taller_id => %s, p_cargo => 'Docente', p_localidad_id => 1::smallint,
             p_institucion_tipo => 'SIN_INSTITUCION')$$, current_setting('test.t_bor')),
  'DA003', null, 'anon: un taller en borrador da DA003');
select throws_ok(
  format($$select public.registrar_descarga(p_taller_id => %s, p_cargo => 'Docente', p_localidad_id => 1::smallint,
             p_institucion_tipo => 'SIN_INSTITUCION')$$, current_setting('test.t_ina')),
  'DA003', null, 'anon: un taller inactivo da DA003');
select throws_ok(
  format($$select public.registrar_descarga(p_taller_id => %s, p_cargo => 'Docente', p_localidad_id => 1::smallint,
             p_institucion_tipo => 'PADRON', p_establecimiento_id => 999999)$$, current_setting('test.t_bor')),
  'DA003', null, 'anon: con taller y establecimiento invalidos, el taller es lo primero (DA003)');

select throws_ok(
  format($$select public.registrar_descarga(p_taller_id => %s, p_cargo => 'Docente', p_localidad_id => 1::smallint,
             p_institucion_tipo => 'PADRON', p_establecimiento_id => %s)$$,
         current_setting('test.t_pub'), current_setting('test.est_b')),
  'DA004', null, 'anon: un establecimiento inactivo da DA004');
select throws_ok(
  format($$select public.registrar_descarga(p_taller_id => %s, p_cargo => 'Docente', p_localidad_id => 1::smallint,
             p_institucion_tipo => 'PADRON', p_establecimiento_id => %s)$$,
         current_setting('test.t_pub'), current_setting('test.est_c')),
  'DA004', null, 'anon: un establecimiento de otra localidad da DA004');
select throws_ok(
  format($$select public.registrar_descarga(p_taller_id => %s, p_cargo => 'Docente', p_localidad_id => 1::smallint,
             p_institucion_tipo => 'PADRON', p_establecimiento_id => 999999)$$, current_setting('test.t_pub')),
  'DA004', null, 'anon: un establecimiento inexistente da DA004');
reset role;

-- Resultado de la RPC de anon (como postgres, solo lectura) ----------------------------------------
select results_eq(
  $$select institucion_tipo::text, establecimiento_id, cargo_otro::text, institucion_otra::text from public.registro_descarga
     where cargo = 'Docente' and localidad_id = 1 and institucion_tipo = 'PADRON'
       and establecimiento_id = current_setting('test.est_a')::int$$,
  $$values ('PADRON'::text, current_setting('test.est_a')::int, null::text, null::text)$$,
  'la RPC inserta la fila PADRON con el establecimiento y sin campos residuales');
select results_eq(
  $$select institucion_tipo::text, establecimiento_id, institucion_otra::text, cargo_otro::text from public.registro_descarga
     where cargo = 'Director/a' and localidad_id = 1 and institucion_otra = 'Escuela X'$$,
  $$values ('OTRA'::text, null::int, 'Escuela X'::text, null::text)$$,
  'OTRA con un id queda con establecimiento_id nulo y el nombre recortado');
select results_eq(
  $$select cargo_otro::text, institucion_otra::text, establecimiento_id, institucion_tipo::text from public.registro_descarga
     where cargo = 'Docente' and localidad_id = 3$$,
  $$values (null::text, null::text, null::int, 'SIN_INSTITUCION'::text)$$,
  'Docente con cargo_otro y SIN_INSTITUCION con id y nombre quedan con los tres nulos');
select results_eq(
  $$select cargo_otro::text from public.registro_descarga where cargo = 'Otro' and localidad_id = 4$$,
  array['Bibliotecaria'], 'el cargo_otro se recorta');
select results_eq(
  $$select institucion_otra::text, establecimiento_id from public.registro_descarga
     where cargo = 'Secretario/a' and localidad_id = 1$$,
  $$values (null::text, current_setting('test.est_a')::int)$$,
  'PADRON con institucion_otra residual queda con institucion_otra nula');
select results_eq(
  $$select establecimiento_id, institucion_otra::text from public.registro_descarga where localidad_id = 6$$,
  $$values (null::int, 'Con id inactivo'::text)$$,
  'OTRA con un id inactivo queda con establecimiento_id nulo');
select results_eq(
  $$select count(*)::int from public.registro_descarga where cargo = 'Docente' and localidad_id in (1, 3, 6)
     and taller_id = current_setting('test.t_bor')::int$$,
  array[0], 'los rechazos (DA003) no dejan filas de talleres no publicados');
select results_eq(
  $$select count(*)::int from public.registro_operacion where tabla = 'registro_descarga'$$,
  array[2], 'los inserts de la RPC no agregan filas a registro_operacion (solo quedan el UPDATE y el DELETE de postgres)');

-- authenticated sin marca de admin ------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"77777777-7777-7777-7777-777777777777","app_metadata":{}}';
select throws_ok(
  $$insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo)
    values (current_setting('test.t_pub')::int, 'Docente', 1, 'SIN_INSTITUCION')$$,
  '42501', null, 'sin marca: INSERT directo en registro_descarga da 42501');
select throws_ok(
  $$update public.registro_descarga set cargo = 'Docente'$$,
  '42501', null, 'sin marca: UPDATE en registro_descarga da 42501');
select throws_ok(
  $$delete from public.registro_descarga$$,
  '42501', null, 'sin marca: DELETE en registro_descarga da 42501');
do $$
begin
  begin
    perform set_config('test.sinmarca_ve', (select count(*)::text from public.registro_descarga), true);
  exception when insufficient_privilege then
    perform set_config('test.sinmarca_ve', '0', true);
  end;
end $$;
select is(current_setting('test.sinmarca_ve'), '0', 'sin marca: no lee registro_descarga');
select lives_ok(
  format($$select public.registrar_descarga(p_taller_id => %s, p_cargo => 'Docente', p_localidad_id => 7::smallint,
             p_institucion_tipo => 'SIN_INSTITUCION')$$, current_setting('test.t_pub')),
  'sin marca: authenticated tambien puede registrar_descarga');
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'talleres'$$,
  array[0], 'sin marca: no lee objetos del bucket talleres (la politica de anon no le alcanza)');

-- admin ----------------------------------------------------------------------------------------------
set local request.jwt.claims =
  '{"role":"authenticated","sub":"77777777-7777-7777-7777-777777777777","app_metadata":{"admin":true}}';
select results_eq(
  $$select count(*)::int from public.registro_descarga where cargo = 'Supervisor/a'$$,
  array[2], 'admin: lee registro_descarga');
select throws_ok(
  $$insert into public.registro_descarga (taller_id, cargo, localidad_id, institucion_tipo)
    values (current_setting('test.t_pub')::int, 'Docente', 1, 'SIN_INSTITUCION')$$,
  '42501', null, 'admin: INSERT directo en registro_descarga da 42501 (solo la RPC inserta)');
select throws_ok(
  $$update public.registro_descarga set cargo = 'Docente'$$,
  '42501', null, 'admin: UPDATE en registro_descarga da 42501 (hasta la vinculacion)');
select throws_ok(
  $$delete from public.registro_descarga$$,
  '42501', null, 'admin: DELETE en registro_descarga da 42501');
select results_eq(
  $$select count(*)::int from storage.objects where bucket_id = 'talleres'$$,
  array[4], 'admin: ve los cuatro objetos del bucket talleres (publicado, borrador, inactivo y huerfano)');

-- admin: registrar_descarga no cuenta (#25) ------------------------------------------------------------
-- Con sesion de admin vuelve antes del insert: valida DA003 y DA004, pero no evalua los CHECK de la tabla (el zod del
-- formulario aplica las mismas reglas). Se distingue por la localidad: 7 la registro 'sin marca' (authenticated normal) y
-- 8 la usa solo el admin.
select results_eq(
  $$select count(*)::int from public.registro_descarga where localidad_id = 7$$,
  array[1], 'admin: authenticated sin marca si registro su descarga (localidad 7)');
select lives_ok(
  format($$select public.registrar_descarga(p_taller_id => %s, p_cargo => 'Docente', p_localidad_id => 8::smallint,
             p_institucion_tipo => 'SIN_INSTITUCION')$$, current_setting('test.t_pub')),
  'admin: registrar_descarga con datos validos no falla');
select results_eq(
  $$select count(*)::int from public.registro_descarga where localidad_id = 8$$,
  array[0], 'admin: registrar_descarga no inserta ninguna fila');
select throws_ok(
  format($$select public.registrar_descarga(p_taller_id => %s, p_cargo => 'Docente', p_localidad_id => 8::smallint,
             p_institucion_tipo => 'SIN_INSTITUCION')$$, current_setting('test.t_bor')),
  'DA003', null, 'admin: un taller en borrador sigue dando DA003');
select throws_ok(
  format($$select public.registrar_descarga(p_taller_id => %s, p_cargo => 'Docente', p_localidad_id => 8::smallint,
             p_institucion_tipo => 'PADRON', p_establecimiento_id => %s)$$,
         current_setting('test.t_pub'), current_setting('test.est_c')),
  'DA004', null, 'admin: un establecimiento de otra localidad sigue dando DA004');
reset role;

select * from finish();
rollback;
