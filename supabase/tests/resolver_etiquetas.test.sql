-- Fase A, primer commit: public.resolver_etiquetas(text[]) returns int[], extraida de guardar_taller.
-- Contrato: security invoker, search_path vacio, sin EXECUTE para public ni anon, con EXECUTE para authenticated
-- (Postgres chequea EXECUTE tambien en las llamadas anidadas, critica punto 1). Normaliza (btrim, minusculas, sin
-- tildes), ignora vacias y duplicadas, crea las que faltan y devuelve los ids (el orden no esta garantizado).
-- La regresion de guardar_taller la cubre talleres.test.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777',
        'authenticated', 'authenticated', 'resolver-admin@test.local');
insert into public.etiqueta (nombre) values ('Existente');

-- Privilegios (como postgres)
select ok(has_function_privilege('authenticated', 'public.resolver_etiquetas(text[])', 'execute'),
  'resolver_etiquetas: authenticated tiene EXECUTE');
select ok(not has_function_privilege('anon', 'public.resolver_etiquetas(text[])', 'execute'),
  'resolver_etiquetas: anon no tiene EXECUTE');
select ok(not (select prosecdef from pg_proc where oid = 'public.resolver_etiquetas(text[])'::regprocedure),
  'resolver_etiquetas es security invoker');
select ok((select proconfig from pg_proc where oid = 'public.resolver_etiquetas(text[])'::regprocedure)
    @> array['search_path=""'],
  'resolver_etiquetas fija search_path vacio');
select ok((select prorettype from pg_proc where oid = 'public.resolver_etiquetas(text[])'::regprocedure)
    = 'int4[]'::regtype,
  'resolver_etiquetas devuelve int[]');

-- anon
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select public.resolver_etiquetas(array['Hack'])$$,
  '42501', null, 'anon: resolver_etiquetas da 42501');
reset role;

-- authenticated sin marca: la creacion de etiquetas nuevas la frena la RLS
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"77777777-7777-7777-7777-777777777777","app_metadata":{}}';
select throws_ok($$select public.resolver_etiquetas(array['Nueva sin marca'])$$,
  '42501', null, 'sin marca: resolver_etiquetas con una etiqueta nueva da 42501');
reset role;

-- admin
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"77777777-7777-7777-7777-777777777777","app_metadata":{"admin":true}}';
do $$
begin
  perform set_config('test.ids1', (
    select array_to_string(array_agg(x order by x), ',') from unnest(
      public.resolver_etiquetas(array['  EXISTENTE ', 'existente', 'Nueva Á', 'nueva a', '', '   '])) as x), true);
  perform set_config('test.ids2', (
    select array_to_string(array_agg(x order by x), ',') from unnest(
      public.resolver_etiquetas(array['Nueva Á', 'Existente'])) as x), true);
end $$;
reset role;

select results_eq(
  $$select e.nombre::text from public.etiqueta e
     where e.id = any (string_to_array(current_setting('test.ids1'), ',')::int[]) order by e.nombre$$,
  array['Existente', 'Nueva Á'],
  'admin: devuelve un id por etiqueta normalizada, sin vacias ni duplicadas, y crea la que falta (recortada)');
select is(current_setting('test.ids2'), current_setting('test.ids1'),
  'admin: resolver de nuevo las mismas etiquetas devuelve los mismos ids');
select results_eq($$select count(*)::int from public.etiqueta$$, array[2],
  'admin: no se crean etiquetas repetidas');
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'etiqueta' and operacion = 'INSERT' and usuario_id = '77777777-7777-7777-7777-777777777777'$$,
  array[1], 'admin: la etiqueta creada queda auditada con su usuario_id');

select * from finish();
rollback;
