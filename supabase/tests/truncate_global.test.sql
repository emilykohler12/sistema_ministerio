-- TRUNCATE no se audita ni pasa por RLS: anon y authenticated no deben tenerlo.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select is_empty(
  $$select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and (has_table_privilege('anon', c.oid, 'TRUNCATE')
        or has_table_privilege('authenticated', c.oid, 'TRUNCATE'))$$,
  'ninguna tabla de public da TRUNCATE a anon ni authenticated');

-- Autoverificacion
create table public.zz_con_truncate (id int);
grant truncate on public.zz_con_truncate to anon;
select isnt_empty(
  $$select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and (has_table_privilege('anon', c.oid, 'TRUNCATE')
        or has_table_privilege('authenticated', c.oid, 'TRUNCATE'))$$,
  'la consulta del guardia detecta un grant de TRUNCATE');

-- Privilegios por defecto de una tabla nueva (creada como postgres)
create table public.zz_nueva (id int);
select ok(not has_table_privilege('anon', 'public.zz_nueva', 'TRUNCATE'),
  'una tabla nueva no da TRUNCATE a anon por defecto');
select ok(not has_table_privilege('authenticated', 'public.zz_nueva', 'TRUNCATE'),
  'una tabla nueva no da TRUNCATE a authenticated por defecto');

select * from finish();
rollback;
