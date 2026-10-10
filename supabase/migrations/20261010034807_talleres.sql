-- Corte talleres (ADR 0007, 0012): talleres con destinatarios y etiquetas. Sin recursos (corte siguiente).
-- Cierra las reglas taller <-> categoria diferidas del corte niveles-categorias (definicion §5.3 y §8.4).

-- estado_taller ------------------------------------------------------------
-- Enum y no varchar+CHECK: es una lista cerrada que el frontend usa como tipo, y db:types genera la union.
-- Desvio de §8.3, anotado ahi junto con el criterio enum vs. CHECK.
create type public.estado_taller as enum ('BORRADOR', 'PUBLICADO', 'INACTIVO');

-- taller -------------------------------------------------------------------
-- Sin borrado fisico desde la API: la baja es pasar a INACTIVO.
create table public.taller (
  id int generated always as identity primary key,
  categoria_id int not null references public.categoria (id),
  nombre varchar(200) not null check (btrim(nombre) <> ''),
  descripcion text not null check (btrim(descripcion) <> ''),
  estado public.estado_taller not null default 'BORRADOR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- La usa el count de categoria_validar_baja y el listado por categoria.
create index taller_categoria_id_idx on public.taller (categoria_id);

-- RLS: anon y authenticated sin la marca solo leen los publicados. Escribe solo el admin. Sin delete.
alter table public.taller enable row level security;

create policy taller_select
  on public.taller
  for select
  to anon, authenticated
  using (estado = 'PUBLICADO' or (select public.es_admin()));

create policy taller_insert_admin
  on public.taller
  for insert
  to authenticated
  with check ((select public.es_admin()));

create policy taller_update_admin
  on public.taller
  for update
  to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

-- destinatario -------------------------------------------------------------
-- Catalogo fijo (P-02, a confirmar), con ids explicitos. La constante DESTINATARIOS del frontend debe
-- coincidir (el pgTAP compara las filas exactas). Sin timestamps: no hay escrituras desde la API.
create table public.destinatario (
  id smallint primary key,
  nombre varchar(100) not null unique
);

insert into public.destinatario (id, nombre)
values (1, 'Directivos'),
       (2, 'Familias'),
       (3, 'Estudiantes'),
       (4, 'Docentes'),
       (5, 'Comunidad educativa');

-- Solo lectura publica. Sin politicas de escritura: ningun rol de la API (tampoco el admin) los modifica.
alter table public.destinatario enable row level security;

create policy destinatario_select_publico
  on public.destinatario
  for select
  to anon, authenticated
  using (true);

-- etiqueta -----------------------------------------------------------------
-- Unica sin distinguir mayusculas, tildes ni espacios en los bordes. El nombre se guarda recortado
-- (guardar_taller lo hace; el CHECK solo exige que no sea vacio). Lectura publica: el portal solo la ve
-- por el embed, que ya pasa por la RLS de los puentes. Sin update ni delete (borrar huerfanas queda fuera).
create table public.etiqueta (
  id int generated always as identity primary key,
  nombre varchar(100) not null check (btrim(nombre) <> '')
);

create unique index etiqueta_nombre_uniq
  on public.etiqueta (lower(public.inmutable_unaccent(btrim(nombre))));

alter table public.etiqueta enable row level security;

create policy etiqueta_select_publico
  on public.etiqueta
  for select
  to anon, authenticated
  using (true);

create policy etiqueta_insert_admin
  on public.etiqueta
  for insert
  to authenticated
  with check ((select public.es_admin()));

-- Puentes ------------------------------------------------------------------
-- PK compuesta (taller_id, x_id); el indice de x_id cubre la FK (taller_id ya es primera columna de la PK).
-- En la auditoria de los puentes registro_id queda nulo (no hay columna "id"); el JSON trae taller_id.
create table public.taller_destinatario (
  taller_id int not null references public.taller (id) on delete cascade,
  destinatario_id smallint not null references public.destinatario (id),
  primary key (taller_id, destinatario_id)
);

create index taller_destinatario_destinatario_id_idx
  on public.taller_destinatario (destinatario_id);

create table public.taller_etiqueta (
  taller_id int not null references public.taller (id) on delete cascade,
  etiqueta_id int not null references public.etiqueta (id),
  primary key (taller_id, etiqueta_id)
);

create index taller_etiqueta_etiqueta_id_idx
  on public.taller_etiqueta (etiqueta_id);

-- Select: la subconsulta pasa por la RLS de taller, asi que la regla de visibilidad queda escrita una sola vez.
-- Insert y delete: solo el admin. Sin update (la PK es toda la fila).
alter table public.taller_destinatario enable row level security;

create policy taller_destinatario_select
  on public.taller_destinatario
  for select
  to anon, authenticated
  using (exists (select 1 from public.taller t where t.id = taller_id));

create policy taller_destinatario_insert_admin
  on public.taller_destinatario
  for insert
  to authenticated
  with check ((select public.es_admin()));

create policy taller_destinatario_delete_admin
  on public.taller_destinatario
  for delete
  to authenticated
  using ((select public.es_admin()));

alter table public.taller_etiqueta enable row level security;

create policy taller_etiqueta_select
  on public.taller_etiqueta
  for select
  to anon, authenticated
  using (exists (select 1 from public.taller t where t.id = taller_id));

create policy taller_etiqueta_insert_admin
  on public.taller_etiqueta
  for insert
  to authenticated
  with check ((select public.es_admin()));

create policy taller_etiqueta_delete_admin
  on public.taller_etiqueta
  for delete
  to authenticated
  using ((select public.es_admin()));

-- Invariante: una categoria inactiva solo tiene talleres inactivos ---------
-- Ambos triggers corren como invoker, con la RLS del admin: funciona porque solo el admin escribe.
--
-- Se bloquea la fila de la categoria con FOR SHARE para serializar la carrera en ambas direcciones
-- (READ COMMITTED): si la baja llega primero, el FOR SHARE espera su commit y lee activo = false (DA002);
-- si el taller llega primero, el UPDATE de la baja espera ese lock y su count posterior ve el taller (DA001).
-- FOR SHARE exige privilegio UPDATE sobre alguna columna de categoria y que se cumpla el using de su politica
-- de update: por eso mas abajo se conserva el grant de update por columna. No revocar todo el UPDATE.
create function public.taller_validar_categoria()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_activo boolean;
begin
  if new.estado <> 'INACTIVO' then
    select c.activo
      into v_activo
      from public.categoria c
     where c.id = new.categoria_id
       for share;

    -- Si no se ve la categoria (no existe o no hay permiso) no se decide aca: lo resuelven la FK y la RLS.
    if v_activo is false then
      raise exception 'La categoria % esta dada de baja', new.categoria_id
        using errcode = 'DA002';
    end if;
  end if;

  return new;
end;
$$;

create trigger taller_validar_categoria
  before insert or update of estado, categoria_id on public.taller
  for each row execute function public.taller_validar_categoria();

-- Funcion de trigger: ningun rol de la API la ejecuta directamente (como auditar() y tocar_updated_at()).
revoke execute on function public.taller_validar_categoria() from public, anon, authenticated, service_role;

-- DA001: el detail lleva la cantidad exacta de talleres no inactivos, como texto (supabase-js lo entrega en "details").
create function public.categoria_validar_baja()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cantidad bigint;
begin
  select count(*)
    into v_cantidad
    from public.taller t
   where t.categoria_id = old.id
     and t.estado <> 'INACTIVO';

  if v_cantidad > 0 then
    raise exception 'No se puede dar de baja la categoria %: tiene talleres en borrador o publicados', old.id
      using errcode = 'DA001', detail = v_cantidad::text;
  end if;

  return new;
end;
$$;

create trigger categoria_validar_baja
  before update of activo on public.categoria
  for each row
  when (old.activo and not new.activo)
  execute function public.categoria_validar_baja();

revoke execute on function public.categoria_validar_baja() from public, anon, authenticated, service_role;

-- categoria.nivel_id queda cerrado: mover una categoria de nivel arrastraria sus talleres. Nadie (tampoco el
-- admin) lo cambia. Se revoca el UPDATE de tabla a anon y authenticated y se da por columna solo lo editable.
-- Este grant por columna es lo que habilita el FOR SHARE de taller_validar_categoria: no revocarlo.
revoke update on public.categoria from anon, authenticated;
grant update (nombre, descripcion, activo) on public.categoria to authenticated;

-- Triggers -----------------------------------------------------------------
create trigger taller_auditar
  after insert or update or delete on public.taller
  for each row execute function public.auditar();

create trigger destinatario_auditar
  after insert or update or delete on public.destinatario
  for each row execute function public.auditar();

create trigger etiqueta_auditar
  after insert or update or delete on public.etiqueta
  for each row execute function public.auditar();

create trigger taller_destinatario_auditar
  after insert or update or delete on public.taller_destinatario
  for each row execute function public.auditar();

create trigger taller_etiqueta_auditar
  after insert or update or delete on public.taller_etiqueta
  for each row execute function public.auditar();

create trigger taller_tocar_updated_at
  before update on public.taller
  for each row execute function public.tocar_updated_at();

-- guardar_taller -----------------------------------------------------------
-- Alta o edicion de un taller con sus destinatarios y etiquetas, en una sola transaccion (la de la llamada).
-- SECURITY INVOKER: la RLS y auth.uid() siguen valiendo, sin chequeo de rol propio (un usuario sin la marca
-- recibe 42501 en el primer insert). p_id nulo = alta; un update que no afecta filas da P0002.
-- p_id va al final y con default null: db:types solo marca opcionales los argumentos con default, y asi el alta
-- (que omite p_id) tipa sin cast en supabase-js. PostgREST llama por nombre, el orden no importa.
create function public.guardar_taller(
  p_categoria_id int,
  p_nombre text,
  p_descripcion text,
  p_estado public.estado_taller,
  p_destinatarios smallint[],
  p_etiquetas text[],
  p_id int default null
)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id int;
  v_nombres text[];
  v_claves text[];
  v_ids int[];
begin
  -- 1. El taller.
  if p_id is null then
    insert into public.taller (categoria_id, nombre, descripcion, estado)
    values (p_categoria_id, p_nombre, p_descripcion, p_estado)
    returning id into v_id;
  else
    update public.taller
       set categoria_id = p_categoria_id,
           nombre = p_nombre,
           descripcion = p_descripcion,
           estado = p_estado
     where id = p_id
    returning id into v_id;

    if not found then
      raise exception 'El taller % no existe', p_id using errcode = 'P0002';
    end if;
  end if;

  -- 2. Etiquetas, en tres sentencias separadas.
  -- (a) Normalizar una sola vez, sin duplicados: una fila por clave, con el primer valor recortado.
  select coalesce(array_agg(n.nombre order by n.ord), '{}'),
         coalesce(array_agg(n.clave order by n.ord), '{}')
    into v_nombres, v_claves
    from (
      select distinct on (k.clave) btrim(e.n) as nombre, k.clave, e.ord
        from unnest(p_etiquetas) with ordinality as e(n, ord)
        cross join lateral (
          select lower(public.inmutable_unaccent(btrim(e.n))) as clave
        ) k
       where btrim(e.n) <> ''
       order by k.clave, e.ord
    ) n;

  -- (b) Crear las que faltan. Sin target: alcanza con el indice unico normalizado, y una carrera con otro
  -- guardado de la misma etiqueta la saltea tras esperar su commit.
  insert into public.etiqueta (nombre)
  select unnest(v_nombres)
  on conflict do nothing;

  -- (c) Buscar los ids en otra sentencia (snapshot nuevo, ve las filas recien insertadas o confirmadas por otro).
  -- Si falta alguno es un error, no una etiqueta perdida en silencio.
  select coalesce(array_agg(e.id), '{}')
    into v_ids
    from public.etiqueta e
   where lower(public.inmutable_unaccent(btrim(e.nombre))) = any (v_claves);

  if cardinality(v_ids) <> cardinality(v_claves) then
    raise exception 'No se pudieron resolver todas las etiquetas del taller %', v_id;
  end if;

  -- 3. Sincronizar los puentes por diferencia (borra las quitadas, inserta las nuevas), para no inflar la auditoria.
  delete from public.taller_destinatario
   where taller_id = v_id
     and destinatario_id <> all (coalesce(p_destinatarios, '{}'));

  insert into public.taller_destinatario (taller_id, destinatario_id)
  select v_id, d
    from unnest(coalesce(p_destinatarios, '{}')) as d
  on conflict do nothing;

  delete from public.taller_etiqueta
   where taller_id = v_id
     and etiqueta_id <> all (v_ids);

  insert into public.taller_etiqueta (taller_id, etiqueta_id)
  select v_id, x
    from unnest(v_ids) as x
  on conflict do nothing;

  return v_id;
end;
$$;

-- Postgres da EXECUTE a PUBLIC y Supabase lo agrega a anon por privilegios por defecto: se cierra a mano.
revoke execute on function public.guardar_taller(int, text, text, public.estado_taller, smallint[], text[], int)
  from public, anon;
grant execute on function public.guardar_taller(int, text, text, public.estado_taller, smallint[], text[], int)
  to authenticated;
