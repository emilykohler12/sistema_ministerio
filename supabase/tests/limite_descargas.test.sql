-- Limite de frecuencia de las descargas (#26; criterios 1, 2, 3, 4 y 6 de docs/specs/limite-descargas/spec.md; ADR 0030).
-- La RPC registrar_descarga deja de CONTAR (no rechaza, no lanza) las descargas de una IP con 30 intentos en los ultimos 10 minutos.
--
-- CONTRATO (lo que debe cumplir la migracion; el test llama por nombre):
--
--   public.intento_descarga (id bigint identity, ip_hash bytea not null, fecha_hora timestamptz not null default now())
--     RLS habilitada y SIN politicas. Sin grants para anon ni authenticated (ni en la tabla ni en la secuencia). Sin auditar().
--
--   HASH: ip_hash = sha256(convert_to('<ip>', 'UTF8')), sha256 nativo de Postgres sobre el texto de x-real-ip tal cual llega (32 bytes).
--     Sin sal. Este test siembra con esa misma expresion (pg_temp.sembrar); la migracion debe usarla igual.
--
--   VENTANA: c_ventana = '10 minutes', c_tope = 30. Un intento cuenta si fecha_hora > now() - c_ventana (el de hace exactamente
--     10 minutos NO cuenta). La purga borra fecha_hora < now() - c_ventana, de cualquier IP. now() es fijo dentro de la transaccion
--     de pgTAP, por eso se siembran intentos con fecha_hora = now() - edad.
--
--   public.ip_cliente() returns text (invoker, stable, search_path ''): nullif(current_setting('request.headers', true), '')::json
--     ->> 'x-real-ip'. Nulo sin encabezados, con '' o sin la clave. EXECUTE revocado a public, anon, authenticated y service_role.
--
--   public.registrar_descarga (misma firma): orden = normaliza -> DA003 -> DA004 -> if es_admin() return -> si hay IP:
--     lock por hash, purga global, cuenta; si llega a 30 -> return (responde bien, sin insertar nada) -> insert del intento -> insert
--     del registro. Sin IP no hay tope ni intento. Sigue siendo security definer, search_path '' y ejecutable por anon.
--
-- Notas de diseno del test:
-- - Cada caso fija sus propios request.headers con set_config(..., true) (dura hasta el rollback final). El caso "sin encabezado"
--   va primero, antes de que cualquier otro lo fije.
-- - Cada caso siembra como postgres justo antes de llamar: la purga de una llamada borra los intentos de mas de 10 minutos de
--   cualquier IP, asi que un intento viejo sembrado antes de otro caso no sobreviviria.
-- - Un intento nuevo de la RPC se reconoce por fecha_hora = now(): todas las siembras son de al menos 1 minuto atras.
-- - La concurrencia (criterio 5) no se prueba aca: se verifica en la revision.
begin;
create extension if not exists pgtap with schema extensions;
select plan(98);

-- Soporte (como postgres) -----------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '88888888-8888-8888-8888-888888888888',
        'authenticated', 'authenticated', 'limite-admin@test.local');

insert into public.categoria (nivel_id, nombre, descripcion, activo) values (1, 'Cat Limite', 'base', true);

insert into public.taller (categoria_id, nombre, descripcion, estado, created_at, updated_at)
select c.id, v.nombre, 'd', v.estado::public.estado_taller, '2020-01-01', '2020-01-01'
  from public.categoria c,
       (values ('L Pub', 'PUBLICADO'), ('L Bor', 'BORRADOR')) as v(nombre, estado)
 where c.nombre = 'Cat Limite';

insert into public.establecimiento (cue, nombre, localidad_id, activo)
values ('9101', 'Limite Activa', 2, true);

do $$
begin
  perform set_config('test.t_pub', (select id::text from public.taller where nombre = 'L Pub'), true);
  perform set_config('test.t_bor', (select id::text from public.taller where nombre = 'L Bor'), true);
  perform set_config('test.est', (select id::text from public.establecimiento where cue = '9101'), true);
end $$;

-- sembrar(ip, n, edad): n intentos de esa IP con fecha_hora = now() - edad (la misma expresion de hash que la RPC).
create function pg_temp.sembrar(ip text, n int, edad interval) returns void language sql as $$
  insert into public.intento_descarga (ip_hash, fecha_hora)
  select sha256(convert_to(ip, 'UTF8')), now() - edad from generate_series(1, n)
$$;
-- n_ip(ip): cuantos intentos hay de esa IP.
create function pg_temp.n_ip(ip text) returns int language sql as $$
  select count(*)::int from public.intento_descarga where ip_hash = sha256(convert_to(ip, 'UTF8'))
$$;
-- n_nuevos(): intentos con fecha_hora = now() (los dejo la RPC en esta transaccion).
create function pg_temp.n_nuevos() returns int language sql as $$
  select count(*)::int from public.intento_descarga where fecha_hora = now()
$$;
-- n_hash_invalidos(): cuantos ip_hash no miden 32 bytes; nulo si no hay ninguno guardado (la asercion falla en lugar de pasar vacia).
create function pg_temp.n_hash_invalidos() returns int language sql as $$
  select case when count(*) = 0 then null else count(*) filter (where octet_length(ip_hash) <> 32)::int end
    from public.intento_descarga
$$;
create function pg_temp.ip() returns text language sql as $$ select public.ip_cliente() $$;
-- n_reg(loc): descargas del taller publicado del test en esa localidad (no depende de lo que haya en la base local).
create function pg_temp.n_reg(loc int) returns int language sql as $$
  select count(*)::int from public.registro_descarga
   where localidad_id = loc and taller_id = current_setting('test.t_pub')::int
$$;

-- Caso 0: sin encabezado (request.headers sin fijar; sin HTTP) --------------------------------
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
select lives_ok(
  $$select public.registrar_descarga(current_setting('test.t_pub')::int, 'Docente', 10::smallint, 'SIN_INSTITUCION')$$,
  'sin encabezado: registrar_descarga responde bien');
reset role;
select is(pg_temp.n_reg(10), 1, 'sin encabezado: registra la descarga');
select is(pg_temp.n_nuevos(), 0, 'sin encabezado: no deja intento');

-- Estructura (como postgres) --------------------------------------------------------------
select has_table('public', 'intento_descarga', 'existe la tabla intento_descarga');
select col_type_is('public', 'intento_descarga', 'ip_hash', 'bytea', 'ip_hash es bytea');
select col_type_is('public', 'intento_descarga', 'fecha_hora', 'timestamp with time zone', 'fecha_hora es timestamptz');
select ok((select relrowsecurity from pg_class where oid = 'public.intento_descarga'::regclass),
  'intento_descarga tiene RLS habilitada');
select ok(
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'intento_descarga'),
  'intento_descarga existe y no tiene politicas');
select has_function('public', 'ip_cliente', array[]::name[], 'existe public.ip_cliente()');

select ok(not has_table_privilege('anon', 'public.intento_descarga', 'select,insert,update,delete'),
  'anon no tiene ningun privilegio sobre intento_descarga');
select ok(not has_table_privilege('authenticated', 'public.intento_descarga', 'select,insert,update,delete'),
  'authenticated no tiene ningun privilegio sobre intento_descarga');
select ok(not has_sequence_privilege('anon', 'public.intento_descarga_id_seq', 'usage,select,update'),
  'anon no tiene ningun privilegio sobre intento_descarga_id_seq');
select ok(not has_sequence_privilege('authenticated', 'public.intento_descarga_id_seq', 'usage,select,update'),
  'authenticated no tiene ningun privilegio sobre intento_descarga_id_seq');

-- ip_cliente() directo (como postgres) ---------------------------------------------------------
select set_config('request.headers', '{"x-real-ip":"10.0.0.50","x-forwarded-for":"6.6.6.6, 10.0.0.50"}', true);
select is(pg_temp.ip(), '10.0.0.50', 'ip_cliente devuelve x-real-ip');
select set_config('request.headers', '{"x-forwarded-for":"10.0.0.51"}', true);
select is(pg_temp.ip(), null, 'ip_cliente ignora x-forwarded-for: sin x-real-ip es nulo');
select set_config('request.headers', '', true);
select is(pg_temp.ip(), null, 'ip_cliente con request.headers vacio es nulo (no revienta con el cast a json)');
select set_config('request.headers', '{}', true);
select is(pg_temp.ip(), null, 'ip_cliente con {} es nulo');

-- Privilegios de las funciones ---------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.ip_cliente()', 'execute'),
  'ip_cliente: anon no tiene EXECUTE');
select ok(not has_function_privilege('authenticated', 'public.ip_cliente()', 'execute'),
  'ip_cliente: authenticated no tiene EXECUTE');
select ok(not has_function_privilege('service_role', 'public.ip_cliente()', 'execute'),
  'ip_cliente: service_role no tiene EXECUTE');
select ok(
  (select prosecdef from pg_proc
    where oid = 'public.registrar_descarga(int, text, smallint, public.tipo_institucion, text, int, text)'::regprocedure),
  'registrar_descarga sigue siendo security definer');
select ok(
  (select proconfig from pg_proc
    where oid = 'public.registrar_descarga(int, text, smallint, public.tipo_institucion, text, int, text)'::regprocedure)
    @> array['search_path=""'],
  'registrar_descarga sigue fijando search_path vacio');
select ok(
  has_function_privilege('anon', 'public.registrar_descarga(int, text, smallint, public.tipo_institucion, text, int, text)', 'execute'),
  'registrar_descarga sigue siendo ejecutable por anon');

-- Caso A (criterio 1): 30 intentos en la ventana -> no cuenta, no lanza ---------------------------------
select lives_ok($$select pg_temp.sembrar('10.0.0.1', 30, interval '1 minute')$$, 'A: siembra 30 intentos de 10.0.0.1');
select set_config('request.headers', '{"x-real-ip":"10.0.0.1"}', true);
set local role anon;
select lives_ok(
  $$select public.registrar_descarga(current_setting('test.t_pub')::int, 'Docente', 11::smallint, 'SIN_INSTITUCION')$$,
  'tope: con 30 intentos la RPC responde bien (no lanza)');
reset role;
select is(pg_temp.n_reg(11), 0, 'tope: no inserta en registro_descarga');
select is(pg_temp.n_ip('10.0.0.1'), 30, 'tope: no inserta un intento mas (siguen 30)');

-- Caso B: 29 intentos -> cuenta y deja su intento -------------------------------------------------------------
select lives_ok($$select pg_temp.sembrar('10.0.0.2', 29, interval '1 minute')$$, 'B: siembra 29 intentos de 10.0.0.2');
select set_config('request.headers', '{"x-real-ip":"10.0.0.2"}', true);
set local role anon;
select lives_ok(
  $$select public.registrar_descarga(current_setting('test.t_pub')::int, 'Docente', 12::smallint, 'SIN_INSTITUCION')$$,
  '29 intentos: la RPC responde bien');
reset role;
select is(pg_temp.n_reg(12), 1, '29 intentos: inserta en registro_descarga');
select is(pg_temp.n_ip('10.0.0.2'), 30, '29 intentos: inserta su intento (pasan a 30)');

-- Caso C: borde de la ventana ---------------------------------------------------------------------------------------
select lives_ok($$select pg_temp.sembrar('10.0.0.3', 30, interval '9 minutes 59 seconds')$$, 'C1: siembra 30 intentos de hace 9:59');
select set_config('request.headers', '{"x-real-ip":"10.0.0.3"}', true);
set local role anon;
select lives_ok(
  $$select public.registrar_descarga(current_setting('test.t_pub')::int, 'Docente', 13::smallint, 'SIN_INSTITUCION')$$,
  'borde: 30 intentos de hace 9:59 responde bien');
reset role;
select is(pg_temp.n_reg(13), 0, 'borde: 30 intentos de hace 9:59 siguen en la ventana: no cuenta');

select lives_ok($$select pg_temp.sembrar('10.0.0.4', 30, interval '10 minutes')$$, 'C2: siembra 30 intentos de hace exactamente 10 minutos');
select set_config('request.headers', '{"x-real-ip":"10.0.0.4"}', true);
set local role anon;
select lives_ok(
  $$select public.registrar_descarga(current_setting('test.t_pub')::int, 'Docente', 14::smallint, 'SIN_INSTITUCION')$$,
  'borde: 30 intentos de hace exactamente 10 minutos responde bien');
reset role;
select is(pg_temp.n_reg(14), 1, 'borde: un intento de hace exactamente 10 minutos ya no cuenta (fecha_hora > now() - ventana)');

select lives_ok($$select pg_temp.sembrar('10.0.0.5', 29, interval '1 minute')$$, 'C3: siembra 29 recientes de 10.0.0.5');
select lives_ok($$select pg_temp.sembrar('10.0.0.5', 30, interval '11 minutes')$$, 'C3: siembra 30 vencidos de 10.0.0.5');
select set_config('request.headers', '{"x-real-ip":"10.0.0.5"}', true);
set local role anon;
select lives_ok(
  $$select public.registrar_descarga(current_setting('test.t_pub')::int, 'Docente', 15::smallint, 'SIN_INSTITUCION')$$,
  'ventana: 29 recientes y 30 vencidos responde bien');
reset role;
select is(pg_temp.n_reg(15), 1, 'ventana: los vencidos no cuentan: registra');
select is(pg_temp.n_ip('10.0.0.5'), 30, 'ventana: quedan los 29 recientes mas el nuevo (los vencidos se purgaron)');

-- Caso D (criterio 2): las rechazadas no dejan intento ni cuentan para el tope ----------------------------------------
select lives_ok($$select pg_temp.sembrar('10.0.0.6', 29, interval '1 minute')$$, 'D: siembra 29 intentos de 10.0.0.6');
select set_config('request.headers', '{"x-real-ip":"10.0.0.6"}', true);
set local role anon;
select throws_ok(
  format($$select public.registrar_descarga(%s, 'Docente', 16::smallint, 'SIN_INSTITUCION')$$, current_setting('test.t_bor')),
  'DA003', null, 'rechazada: un taller en borrador da DA003 (se evalua antes que el tope)');
select throws_ok(
  format($$select public.registrar_descarga(%s, 'Docente', 1::smallint, 'PADRON', null, %s)$$,
         current_setting('test.t_pub'), current_setting('test.est')),
  'DA004', null, 'rechazada: un establecimiento de otra localidad da DA004');
select throws_ok(
  format($$select public.registrar_descarga(%s, 'Otro', 16::smallint, 'SIN_INSTITUCION', '   ')$$, current_setting('test.t_pub')),
  '23514', null, 'rechazada: un CHECK que falla da 23514');
reset role;
select is(pg_temp.n_ip('10.0.0.6'), 29, 'rechazadas: no dejan intento (siguen 29)');
set local role anon;
select lives_ok(
  $$select public.registrar_descarga(current_setting('test.t_pub')::int, 'Docente', 16::smallint, 'SIN_INSTITUCION')$$,
  'rechazadas: despues de tres rechazos la llamada valida responde bien');
reset role;
select is(pg_temp.n_reg(16), 1, 'rechazadas: no cuentan para el tope: la valida registra');
select is(pg_temp.n_ip('10.0.0.6'), 30, 'rechazadas: la valida deja un solo intento');

-- Caso D2 (criterio 2): con el tope alcanzado, DA003 y DA004 se siguen evaluando antes (otra IP, con 30 intentos) -----------
select lives_ok($$select pg_temp.sembrar('10.0.0.30', 30, interval '1 minute')$$, 'D2: siembra 30 intentos de 10.0.0.30');
select set_config('request.headers', '{"x-real-ip":"10.0.0.30"}', true);
set local role anon;
select throws_ok(
  format($$select public.registrar_descarga(%s, 'Docente', 16::smallint, 'SIN_INSTITUCION')$$, current_setting('test.t_bor')),
  'DA003', null, 'con el tope alcanzado: un taller en borrador da DA003 (se evalua antes que el tope)');
select throws_ok(
  format($$select public.registrar_descarga(%s, 'Docente', 1::smallint, 'PADRON', null, %s)$$,
         current_setting('test.t_pub'), current_setting('test.est')),
  'DA004', null, 'con el tope alcanzado: un establecimiento de otra localidad da DA004 (se evalua antes que el tope)');
reset role;

-- Caso E: el admin no deja intento --------------------------------------------------------------------------------------------
select set_config('request.headers', '{"x-real-ip":"10.0.0.7"}', true);
set local request.jwt.claims =
  '{"role":"authenticated","sub":"88888888-8888-8888-8888-888888888888","app_metadata":{"admin":true}}';
set local role authenticated;
select lives_ok(
  $$select public.registrar_descarga(current_setting('test.t_pub')::int, 'Docente', 17::smallint, 'SIN_INSTITUCION')$$,
  'admin: registrar_descarga responde bien');
reset role;
select is(pg_temp.n_reg(17), 0, 'admin: no registra (#25)');
select is(pg_temp.n_ip('10.0.0.7'), 0, 'admin: no deja intento');

-- Caso F: authenticated sin marca de admin se trata como anon ---------------------------------------------------------------------
select lives_ok($$select pg_temp.sembrar('10.0.0.8', 30, interval '1 minute')$$, 'F: siembra 30 intentos de 10.0.0.8');
set local request.jwt.claims =
  '{"role":"authenticated","sub":"88888888-8888-8888-8888-888888888888","app_metadata":{}}';
select set_config('request.headers', '{"x-real-ip":"10.0.0.8"}', true);
set local role authenticated;
select lives_ok(
  $$select public.registrar_descarga(current_setting('test.t_pub')::int, 'Docente', 18::smallint, 'SIN_INSTITUCION')$$,
  'sin marca: con 30 intentos responde bien');
reset role;
select is(pg_temp.n_reg(18), 0, 'sin marca: con 30 intentos no cuenta');
select set_config('request.headers', '{"x-real-ip":"10.0.0.9"}', true);
set local role authenticated;
select lives_ok(
  $$select public.registrar_descarga(current_setting('test.t_pub')::int, 'Docente', 19::smallint, 'SIN_INSTITUCION')$$,
  'sin marca: sin intentos previos responde bien');
reset role;
select is(pg_temp.n_reg(19), 1, 'sin marca: sin intentos previos registra');
select is(pg_temp.n_ip('10.0.0.9'), 1, 'sin marca: deja su intento');

-- Caso G (criterio 3): sin IP utilizable no hay tope ni intento -------------------------------------------------------------------------
set local request.jwt.claims = '{"role":"anon"}';
select set_config('request.headers', '', true);
-- now() es fijo en la transaccion: n_nuevos() acumula los intentos de los casos anteriores, asi que se mide la diferencia.
select set_config('test.n0', pg_temp.n_nuevos()::text, true);
set local role anon;
select lives_ok(
  $$select public.registrar_descarga(current_setting('test.t_pub')::int, 'Docente', 20::smallint, 'SIN_INSTITUCION')$$,
  'headers vacio: responde bien');
reset role;
select is(pg_temp.n_reg(20), 1, 'headers vacio: registra');
select is(pg_temp.n_nuevos() - current_setting('test.n0')::int, 0, 'headers vacio: no deja intento');

select set_config('request.headers', '{"user-agent":"x"}', true);
select set_config('test.n0', pg_temp.n_nuevos()::text, true);
set local role anon;
select lives_ok(
  $$select public.registrar_descarga(current_setting('test.t_pub')::int, 'Docente', 21::smallint, 'SIN_INSTITUCION')$$,
  'headers sin x-real-ip: responde bien');
reset role;
select is(pg_temp.n_reg(21), 1, 'headers sin x-real-ip: registra');
select is(pg_temp.n_nuevos() - current_setting('test.n0')::int, 0, 'headers sin x-real-ip: no deja intento');

-- Un x-forwarded-for solo (con 30 intentos sembrados para esa IP) no se usa: no hay tope ni intento.
select lives_ok($$select pg_temp.sembrar('10.0.0.10', 30, interval '1 minute')$$, 'G: siembra 30 intentos de 10.0.0.10');
select set_config('request.headers', '{"x-forwarded-for":"10.0.0.10"}', true);
set local role anon;
select lives_ok(
  $$select public.registrar_descarga(current_setting('test.t_pub')::int, 'Docente', 22::smallint, 'SIN_INSTITUCION')$$,
  'solo x-forwarded-for: responde bien');
reset role;
select is(pg_temp.n_reg(22), 1, 'solo x-forwarded-for: se ignora, registra');
select is(pg_temp.n_ip('10.0.0.10'), 30, 'solo x-forwarded-for: no deja intento');

-- Caso H: un x-forwarded-for distinto no cambia la IP contada ----------------------------------------------------------------------------
select lives_ok($$select pg_temp.sembrar('10.0.0.11', 30, interval '1 minute')$$, 'H: siembra 30 intentos de 10.0.0.11');
select set_config('request.headers', '{"x-real-ip":"10.0.0.11","x-forwarded-for":"10.0.0.99"}', true);
set local role anon;
select lives_ok(
  $$select public.registrar_descarga(current_setting('test.t_pub')::int, 'Docente', 23::smallint, 'SIN_INSTITUCION')$$,
  'x-forwarded-for falso: responde bien');
reset role;
select is(pg_temp.n_reg(23), 0, 'x-forwarded-for falso: el tope sigue por x-real-ip');

select lives_ok($$select pg_temp.sembrar('10.0.0.14', 30, interval '1 minute')$$, 'H: siembra 30 intentos de 10.0.0.14');
select set_config('request.headers', '{"x-real-ip":"10.0.0.13","x-forwarded-for":"10.0.0.14"}', true);
set local role anon;
select lives_ok(
  $$select public.registrar_descarga(current_setting('test.t_pub')::int, 'Docente', 24::smallint, 'SIN_INSTITUCION')$$,
  'x-forwarded-for de una IP topeada: responde bien');
reset role;
select is(pg_temp.n_reg(24), 1, 'x-forwarded-for de una IP topeada no frena a otra x-real-ip: registra');
select is(pg_temp.n_ip('10.0.0.13'), 1, 'el intento queda a nombre de x-real-ip');
select is(pg_temp.n_ip('10.0.0.14'), 30, 'la IP del x-forwarded-for no suma intentos');

-- Caso I (criterio 4): la purga es global ------------------------------------------------------------------------------------------------------
select lives_ok($$select pg_temp.sembrar('10.0.0.20', 5, interval '11 minutes')$$, 'I: siembra 5 intentos vencidos de 10.0.0.20');
select lives_ok($$select pg_temp.sembrar('10.0.0.21', 2, interval '1 minute')$$, 'I: siembra 2 intentos recientes de 10.0.0.21');
select set_config('request.headers', '{"x-real-ip":"10.0.0.22"}', true);
set local role anon;
select lives_ok(
  $$select public.registrar_descarga(current_setting('test.t_pub')::int, 'Docente', 25::smallint, 'SIN_INSTITUCION')$$,
  'purga: una llamada de otra IP responde bien');
reset role;
select is(pg_temp.n_ip('10.0.0.20'), 0, 'purga: los intentos vencidos de OTRA IP desaparecen');
select is(pg_temp.n_ip('10.0.0.21'), 2, 'purga: los recientes de otra IP se conservan');

-- Datos minimos (criterio 4): solo el hash, de 32 bytes ---------------------------------------------------------------------------------------------
select is(pg_temp.n_hash_invalidos(), 0, 'ip_hash tiene siempre 32 bytes (sha256) y hay intentos guardados');
select is(pg_temp.n_ip('10.0.0.22'), 1, 'el intento guardado es sha256(convert_to(ip, UTF8)) de x-real-ip');

-- Acceso (criterio 6) ---------------------------------------------------------------------------------------------------------------------------------------
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
select throws_ok($$select * from public.intento_descarga$$, '42501', null, 'anon: SELECT en intento_descarga da 42501');
select throws_ok($$insert into public.intento_descarga (ip_hash) values ('\x00')$$, '42501', null, 'anon: INSERT en intento_descarga da 42501');
select throws_ok($$delete from public.intento_descarga$$, '42501', null, 'anon: DELETE en intento_descarga da 42501');
select throws_ok($$select public.ip_cliente()$$, '42501', null, 'anon: ip_cliente() da 42501');
reset role;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"88888888-8888-8888-8888-888888888888","app_metadata":{}}';
set local role authenticated;
select throws_ok($$select * from public.intento_descarga$$, '42501', null, 'authenticated: SELECT en intento_descarga da 42501');
select throws_ok($$insert into public.intento_descarga (ip_hash) values ('\x00')$$, '42501', null, 'authenticated: INSERT en intento_descarga da 42501');
select throws_ok($$select public.ip_cliente()$$, '42501', null, 'authenticated: ip_cliente() da 42501');
reset role;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"88888888-8888-8888-8888-888888888888","app_metadata":{"admin":true}}';
set local role authenticated;
select throws_ok($$select * from public.intento_descarga$$, '42501', null, 'admin: SELECT en intento_descarga da 42501');
select throws_ok($$insert into public.intento_descarga (ip_hash) values ('\x00')$$, '42501', null, 'admin: INSERT en intento_descarga da 42501');
select throws_ok($$delete from public.intento_descarga$$, '42501', null, 'admin: DELETE en intento_descarga da 42501');
select throws_ok($$select public.ip_cliente()$$, '42501', null, 'admin: ip_cliente() da 42501');
reset role;

select * from finish();
rollback;
