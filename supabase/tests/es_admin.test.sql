-- Criterio 5: es_admin() lee app_metadata.admin del JWT (nunca user_metadata).
-- No depende del seed: el JWT se simula con request.jwt.claims.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select has_function('public', 'es_admin', array[]::text[], 'existe public.es_admin()');
select function_returns('public', 'es_admin', array[]::text[], 'boolean', 'es_admin() devuelve boolean');

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"admin":true}}';
select results_eq($$select public.es_admin()$$, array[true],
  'true con app_metadata.admin = true');

set local request.jwt.claims = '{"role":"authenticated","app_metadata":{}}';
select results_eq($$select public.es_admin()$$, array[false],
  'false con authenticated sin la marca de admin');

set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"admin":false}}';
select results_eq($$select public.es_admin()$$, array[false],
  'false con app_metadata.admin = false');

set local request.jwt.claims = '{"role":"authenticated","user_metadata":{"admin":true}}';
select results_eq($$select public.es_admin()$$, array[false],
  'false con user_metadata.admin = true y sin app_metadata (no falsificable)');

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select results_eq($$select public.es_admin()$$, array[false], 'false como anon');

reset role;
select * from finish();
rollback;
