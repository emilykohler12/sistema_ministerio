-- #31: una etiqueta que ya no usa ningun taller ni normativa se borra sola.
-- Contrato (migracion <ts>_etiquetas_huerfanas.sql):
--   public.borrar_etiquetas_huerfanas() returns trigger: security definer, search_path vacio, sin EXECUTE para nadie
--   (solo la dispara el trigger). Dos triggers de sentencia "after delete" con tabla de transicion, uno sobre
--   taller_etiqueta y otro sobre normativa_etiqueta, borran de etiqueta solo los ids de las filas recien borradas que no
--   quedaron en ninguno de los dos puentes. Una huerfana que no aparece en esas filas (por ejemplo una etiqueta recien
--   creada por resolver_etiquetas que todavia no se vinculo) no se toca. etiqueta sigue sin delete para el admin.
--   La migracion tambien hace un delete unico de las huerfanas existentes, sin sesion (usuario_id nulo en la auditoria).
-- No depende del seed: todo se crea dentro de la transaccion (rollback al final).
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

-- Soporte (como postgres, sin claims) -------------------------------------------
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '88888888-8888-8888-8888-888888888888',
        'authenticated', 'authenticated', 'huerfanas-admin@test.local');

insert into public.categoria (nivel_id, nombre, descripcion, activo) values (1, 'Cat Huerfanas', 'base', true);

insert into public.taller (categoria_id, nombre, descripcion, estado)
select c.id, t.nombre, 'd', 'BORRADOR'
  from public.categoria c, (values ('T1'), ('T2'), ('T3')) as t(nombre)
 where c.nombre = 'Cat Huerfanas';

insert into public.normativa (titulo, numero, anio, ruta_archivo) values
  ('N1', 'h-1', 2024, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1.pdf'),
  ('N2', 'h-2', 2024, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2.pdf'),
  ('N3', 'h-3', 2024, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3.pdf');

insert into public.etiqueta (nombre)
values ('Etiq A'), ('Etiq B'), ('Etiq C'), ('Etiq D'), ('Etiq E'), ('Etiq F'), ('Etiq G'), ('Etiq H1');

-- T1: A, B, C. T2: B. T3: G. N1: C, D, E. N2: E. N3: F. H1 queda huerfana.
insert into public.taller_etiqueta (taller_id, etiqueta_id)
select t.id, e.id
  from (values ('T1', 'Etiq A'), ('T1', 'Etiq B'), ('T1', 'Etiq C'), ('T2', 'Etiq B'), ('T3', 'Etiq G')) as v(t, e)
  join public.taller t on t.nombre = v.t
  join public.etiqueta e on e.nombre = v.e;

insert into public.normativa_etiqueta (normativa_id, etiqueta_id)
select n.id, e.id
  from (values ('N1', 'Etiq C'), ('N1', 'Etiq D'), ('N1', 'Etiq E'), ('N2', 'Etiq E'), ('N3', 'Etiq F')) as v(n, e)
  join public.normativa n on n.titulo = v.n
  join public.etiqueta e on e.nombre = v.e;

-- Privilegios y forma de la funcion y los triggers (como postgres) -----------------
select has_function('public', 'borrar_etiquetas_huerfanas', array[]::text[], 'existe borrar_etiquetas_huerfanas()');
select ok((select prosecdef from pg_proc where oid = 'public.borrar_etiquetas_huerfanas()'::regprocedure),
  'borrar_etiquetas_huerfanas es security definer');
select ok((select proconfig from pg_proc where oid = 'public.borrar_etiquetas_huerfanas()'::regprocedure)
    @> array['search_path=""'],
  'borrar_etiquetas_huerfanas fija search_path vacio');
select ok(not has_function_privilege('anon', 'public.borrar_etiquetas_huerfanas()', 'execute'),
  'borrar_etiquetas_huerfanas: anon no tiene EXECUTE');
select ok(not has_function_privilege('authenticated', 'public.borrar_etiquetas_huerfanas()', 'execute'),
  'borrar_etiquetas_huerfanas: authenticated no tiene EXECUTE');
select ok(not has_function_privilege('service_role', 'public.borrar_etiquetas_huerfanas()', 'execute'),
  'borrar_etiquetas_huerfanas: service_role no tiene EXECUTE');
select ok(not has_function_privilege('public', 'public.borrar_etiquetas_huerfanas()', 'execute'),
  'borrar_etiquetas_huerfanas: public no tiene EXECUTE');
select is(
  (select string_agg(t.tgrelid::regclass::text, ',' order by t.tgrelid::regclass::text)
     from pg_trigger t
    where t.tgfoid = 'public.borrar_etiquetas_huerfanas()'::regprocedure
      and not t.tgisinternal
      and (t.tgtype & 1) = 0   -- de sentencia
      and (t.tgtype & 8) = 8   -- delete
      and (t.tgtype & 2) = 0   -- after
      and t.tgnewtable is null and t.tgoldtable is not null),
  'normativa_etiqueta,taller_etiqueta',
  'hay un trigger de sentencia after delete con tabla de transicion sobre cada puente');

-- Limpieza inicial: la sentencia que corre la migracion, sobre una huerfana creada aqui ---
select is(
  (select count(*)::int from public.etiqueta e
    where not exists (select 1 from public.taller_etiqueta te where te.etiqueta_id = e.id)
      and not exists (select 1 from public.normativa_etiqueta ne where ne.etiqueta_id = e.id)),
  1, 'antes de la limpieza hay una huerfana (H1)');
delete from public.etiqueta e
 where not exists (select 1 from public.taller_etiqueta te where te.etiqueta_id = e.id)
   and not exists (select 1 from public.normativa_etiqueta ne where ne.etiqueta_id = e.id);
select is_empty($$select 1 from public.etiqueta where nombre = 'Etiq H1'$$,
  'la limpieza borra la huerfana');
select results_eq($$select count(*)::int from public.etiqueta where nombre ~ '^Etiq [A-G]$'$$, array[7],
  'la limpieza conserva las etiquetas en uso');
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'etiqueta' and operacion = 'DELETE' and usuario_id is null
       and datos_anteriores ->> 'nombre' = 'Etiq H1'$$,
  array[1], 'la limpieza queda auditada con usuario_id nulo');

-- Una huerfana que ningun borrado toca (como una etiqueta recien creada y aun no vinculada).
insert into public.etiqueta (nombre) values ('Etiq H2');

-- Admin ---------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"88888888-8888-8888-8888-888888888888","app_metadata":{"admin":true}}';

-- El admin sigue sin poder borrar etiquetas directamente.
do $$
declare v_n int;
begin
  begin
    with d as (delete from public.etiqueta where nombre = 'Etiq B' returning 1) select count(*) into v_n from d;
  exception when insufficient_privilege then
    v_n := 0;
  end;
  perform set_config('test.borradas_directo', v_n::text, true);
end $$;
select is(current_setting('test.borradas_directo'), '0', 'admin: delete directo en etiqueta no borra nada');
select isnt_empty($$select 1 from public.etiqueta where nombre = 'Etiq B'$$, 'admin: Etiq B sigue despues del delete directo');

-- Taller: quitar la ultima vinculacion borra la etiqueta; las que otro usa quedan.
select lives_ok(
  $$select public.guardar_taller((select id from public.categoria where nombre = 'Cat Huerfanas'), 'T1', 'd',
      'BORRADOR', '{}', array['Etiq B', 'Etiq C'], (select id from public.taller where nombre = 'T1'))$$,
  'taller: T1 deja de usar Etiq A');
select is_empty($$select 1 from public.etiqueta where nombre = 'Etiq A'$$,
  'taller: la etiqueta que ya nadie usa se borra');
select isnt_empty($$select 1 from public.etiqueta where nombre = 'Etiq H2'$$,
  'taller: una huerfana que no estaba entre las quitadas no se toca');

select lives_ok(
  $$select public.guardar_taller((select id from public.categoria where nombre = 'Cat Huerfanas'), 'T1', 'd',
      'BORRADOR', '{}', array['Etiq B'], (select id from public.taller where nombre = 'T1'))$$,
  'taller: T1 deja de usar Etiq C');
select isnt_empty($$select 1 from public.etiqueta where nombre = 'Etiq C'$$,
  'taller: Etiq C queda porque la usa una normativa');

select lives_ok(
  $$select public.guardar_taller((select id from public.categoria where nombre = 'Cat Huerfanas'), 'T2', 'd',
      'BORRADOR', '{}', array[]::text[], (select id from public.taller where nombre = 'T2'))$$,
  'taller: T2 deja de usar Etiq B');
select isnt_empty($$select 1 from public.etiqueta where nombre = 'Etiq B'$$,
  'taller: Etiq B queda porque la usa otro taller');
select lives_ok(
  $$select public.guardar_taller((select id from public.categoria where nombre = 'Cat Huerfanas'), 'T1', 'd',
      'BORRADOR', '{}', array[]::text[], (select id from public.taller where nombre = 'T1'))$$,
  'taller: T1 deja de usar Etiq B');
select is_empty($$select 1 from public.etiqueta where nombre = 'Etiq B'$$,
  'taller: Etiq B se borra cuando el ultimo taller la suelta');

-- Un guardado que suma una etiqueta nueva y quita la unica anterior conserva la nueva.
select lives_ok(
  $$select public.guardar_taller((select id from public.categoria where nombre = 'Cat Huerfanas'), 'T3', 'd',
      'BORRADOR', '{}', array['Etiq Nueva'], (select id from public.taller where nombre = 'T3'))$$,
  'taller: T3 cambia Etiq G por una etiqueta nueva');
select results_eq(
  $$select e.nombre::text from public.taller_etiqueta te
      join public.etiqueta e on e.id = te.etiqueta_id
     where te.taller_id = (select id from public.taller where nombre = 'T3')$$,
  array['Etiq Nueva'], 'taller: la etiqueta nueva queda creada y vinculada');
select is_empty($$select 1 from public.etiqueta where nombre = 'Etiq G'$$, 'taller: la anterior se borra');

-- Normativa: editar.
select lives_ok(
  $$select public.guardar_normativa('N1', null, 'h-1', 2024::smallint, array['Etiq E'], null,
      (select id from public.normativa where titulo = 'N1'))$$,
  'normativa: N1 deja de usar Etiq C y Etiq D');
select results_eq(
  $$select count(*)::int from public.etiqueta where nombre in ('Etiq C', 'Etiq D')$$, array[0],
  'normativa: las etiquetas que ya nadie usa se borran (Etiq C ya no la usa ningun taller)');
select lives_ok(
  $$select public.guardar_normativa('N2', null, 'h-2', 2024::smallint, array[]::text[], null,
      (select id from public.normativa where titulo = 'N2'))$$,
  'normativa: N2 deja de usar Etiq E');
select isnt_empty($$select 1 from public.etiqueta where nombre = 'Etiq E'$$,
  'normativa: Etiq E queda porque la usa otra normativa');
select lives_ok(
  $$select public.guardar_normativa('N1', null, 'h-1', 2024::smallint, array[]::text[], null,
      (select id from public.normativa where titulo = 'N1'))$$,
  'normativa: N1 deja de usar Etiq E');
select is_empty($$select 1 from public.etiqueta where nombre = 'Etiq E'$$,
  'normativa: Etiq E se borra cuando la ultima normativa la suelta');

-- Normativa: la baja borra las etiquetas que solo usaba ella (cascada del puente).
select lives_ok($$delete from public.normativa where titulo = 'N3'$$, 'normativa: se da de baja N3');
select is_empty($$select 1 from public.etiqueta where nombre = 'Etiq F'$$,
  'normativa: la baja borra la etiqueta que solo usaba esa normativa');

-- Auditoria y estado final -------------------------------------------------------------
select results_eq(
  $$select count(*)::int from public.registro_operacion
     where tabla = 'etiqueta' and operacion = 'DELETE' and usuario_id = '88888888-8888-8888-8888-888888888888'$$,
  array[7], 'cada etiqueta borrada por un guardado o una baja queda auditada con el usuario (A a G)');
select results_eq(
  $$select nombre::text from public.etiqueta order by nombre$$,
  array['Etiq H2', 'Etiq Nueva'], 'quedan solo la huerfana ajena y la etiqueta nueva');

select * from finish();
rollback;
