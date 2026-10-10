-- Higiene de las funciones base: search_path fijo e inmutabilidad.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select results_eq(
  $$select 'search_path=""' = any(proconfig) from pg_proc where oid = to_regprocedure('public.es_admin()')$$,
  array[true], 'es_admin() fija search_path vacio');
select results_eq(
  $$select 'search_path=""' = any(proconfig) from pg_proc where oid = to_regprocedure('public.auditar()')$$,
  array[true], 'auditar() fija search_path vacio');
select results_eq(
  $$select 'search_path=""' = any(proconfig) from pg_proc where oid = to_regprocedure('public.inmutable_unaccent(text)')$$,
  array[true], 'inmutable_unaccent() fija search_path vacio');

select volatility_is('public', 'inmutable_unaccent', array['text'], 'immutable',
  'inmutable_unaccent() es IMMUTABLE');
select results_eq($$select public.inmutable_unaccent('Educación Física')$$,
  array['Educacion Fisica'], 'inmutable_unaccent quita las tildes');

select * from finish();
rollback;
