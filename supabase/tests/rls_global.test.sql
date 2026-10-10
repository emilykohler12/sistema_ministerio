-- Criterio 8: ninguna tabla de public puede tener RLS desactivado.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is_empty(
  $$select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity$$,
  'todas las tablas de public tienen RLS habilitado');

-- Autoverificacion: la consulta detecta una tabla sin RLS
create table public.zz_sin_rls (id int);
select isnt_empty(
  $$select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity$$,
  'la consulta del guardia detecta una tabla sin RLS');

select * from finish();
rollback;
