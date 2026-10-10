-- Guardia: toda tabla base de public debe tener un trigger con public.auditar().
-- EXCEPCIONES: cada una debe justificarse por escrito.
--   registro_operacion: es la propia tabla de auditoria (auditarla seria recursivo).
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is_empty(
  $$select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and c.relname <> all (array['registro_operacion'])
      and not exists (
        select 1 from pg_trigger t
        where t.tgrelid = c.oid and not t.tgisinternal
          and t.tgfoid = to_regproc('public.auditar'))$$,
  'toda tabla de public (salvo excepciones) tiene trigger auditar()');

-- Autoverificacion: una tabla sin trigger es detectada
create table public.zz_sin_auditoria (id int);
select isnt_empty(
  $$select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and c.relname <> all (array['registro_operacion'])
      and not exists (
        select 1 from pg_trigger t
        where t.tgrelid = c.oid and not t.tgisinternal
          and t.tgfoid = to_regproc('public.auditar'))$$,
  'la consulta del guardia detecta una tabla sin trigger auditar()');

select * from finish();
rollback;
