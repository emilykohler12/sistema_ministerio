-- Guardia: toda tabla base de public debe tener triggers con public.auditar() que, en conjunto, cubran INSERT, UPDATE y DELETE
-- (tgtype: INSERT = 4, DELETE = 8, UPDATE = 16; 4 + 8 + 16 = 28). Una tabla puede tener varios triggers (normativa tiene dos, con WHEN
-- distinto): lo que cuenta es la union de sus eventos.
-- EXCEPCIONES: cada una debe justificarse por escrito y se declara por evento (mascara de eventos que se exceptuan).
--   registro_operacion (28, todos): es la propia tabla de auditoria (auditarla seria recursivo).
--   registro_descarga (4, INSERT): la tabla es el registro de un hecho anonimo; auditar el INSERT lo duplicaria con usuario_id nulo (0022).
--   intento_descarga (28, todos): contador efimero del limite de frecuencia (0030, #26). Guarda solo un hash de la IP y se purga a los
--     10 minutos: auditarlo copiaria esos seudonimos a registro_operacion, que es permanente, y escribiria una fila por descarga.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- La consulta del guardia, una sola vez. Devuelve las tablas de public cuyos eventos auditados (mas los exceptuados) no suman 28.
create function pg_temp.sin_cobertura() returns setof name language sql as $$
  select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and (coalesce((select bit_or(t.tgtype) from pg_trigger t
                     where t.tgrelid = c.oid and not t.tgisinternal
                       and t.tgfoid = to_regproc('public.auditar')), 0)
          | coalesce((select e.eventos from (values ('registro_operacion', 28), ('registro_descarga', 4), ('intento_descarga', 28)) as e(tabla, eventos)
                       where e.tabla = c.relname), 0)) & 28 <> 28
$$;

select is_empty(
  $$select * from pg_temp.sin_cobertura()$$,
  'toda tabla de public (salvo excepciones por evento) audita INSERT, UPDATE y DELETE con auditar()');

-- Autoverificacion: cada forma de cobertura incompleta es detectada, y la completa con dos triggers no
create table public.zz_sin_auditoria (id int);
select isnt_empty(
  $$select * from pg_temp.sin_cobertura() as t(n) where n = 'zz_sin_auditoria'$$,
  'la consulta del guardia detecta una tabla sin trigger auditar()');

create table public.zz_solo_update (id int);
create trigger zz_solo_update_auditar after update on public.zz_solo_update
  for each row execute function public.auditar();
select isnt_empty(
  $$select * from pg_temp.sin_cobertura() as t(n) where n = 'zz_solo_update'$$,
  'la consulta del guardia detecta una tabla con auditar() solo en after update');

create table public.zz_sin_delete (id int);
create trigger zz_sin_delete_auditar after insert or update on public.zz_sin_delete
  for each row execute function public.auditar();
select isnt_empty(
  $$select * from pg_temp.sin_cobertura() as t(n) where n = 'zz_sin_delete'$$,
  'la consulta del guardia detecta una tabla a la que le falta el evento DELETE');

create table public.zz_completa (id int);
create trigger zz_completa_alta after insert on public.zz_completa
  for each row execute function public.auditar();
create trigger zz_completa_edicion_baja after update or delete on public.zz_completa
  for each row execute function public.auditar();
select is_empty(
  $$select * from pg_temp.sin_cobertura() as t(n) where n = 'zz_completa'$$,
  'la union de dos triggers que cubren los tres eventos pasa el guardia');

select * from finish();
rollback;
