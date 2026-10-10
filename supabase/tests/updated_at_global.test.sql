-- Guardia: toda tabla de public con columna updated_at debe tener un trigger BEFORE UPDATE
-- que ejecute public.tocar_updated_at(). Sin excepciones.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is_empty(
  $$select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'updated_at' and not a.attisdropped
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and not exists (
        select 1 from pg_trigger t
        where t.tgrelid = c.oid and not t.tgisinternal
          and t.tgfoid = to_regproc('public.tocar_updated_at')
          and (t.tgtype & 2) = 2    -- BEFORE
          and (t.tgtype & 16) = 16  -- UPDATE
      )$$,
  'toda tabla de public con updated_at tiene un trigger before update con tocar_updated_at()');

-- Autoverificacion: una tabla con updated_at y sin trigger es detectada
create table public.zz_sin_updated_at (id int, updated_at timestamptz);
select isnt_empty(
  $$select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'updated_at' and not a.attisdropped
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and not exists (
        select 1 from pg_trigger t
        where t.tgrelid = c.oid and not t.tgisinternal
          and t.tgfoid = to_regproc('public.tocar_updated_at')
          and (t.tgtype & 2) = 2
          and (t.tgtype & 16) = 16
      )$$,
  'la consulta del guardia detecta una tabla con updated_at sin trigger');

select * from finish();
rollback;
