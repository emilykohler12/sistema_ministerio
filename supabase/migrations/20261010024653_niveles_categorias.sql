-- Corte niveles-categorias (ADR 0008, 0012): niveles educativos fijos y categorías del catálogo.

-- nivel_educativo ----------------------------------------------------------
-- Catálogo fijo de 0008, con ids explícitos. La constante NIVELES del frontend debe coincidir
-- (el pgTAP compara las filas exactas). Sin created_at/updated_at: no hay escrituras desde la API.
create table public.nivel_educativo (
  id smallint primary key,
  nombre varchar(50) not null unique,
  orden smallint not null
);

insert into public.nivel_educativo (id, nombre, orden)
values (1, 'Inicial', 1),
       (2, 'Primario', 2),
       (3, 'Secundario', 3),
       (4, 'Terciario', 4),
       (5, 'Formación profesional', 5);

-- Solo lectura pública. Sin políticas de escritura: ningún rol de la API (tampoco el admin) los modifica.
alter table public.nivel_educativo enable row level security;

create policy nivel_educativo_select_publico
  on public.nivel_educativo
  for select
  to anon, authenticated
  using (true);

-- categoria ----------------------------------------------------------------
-- Baja lógica con "activo". El nombre es único por nivel sin distinguir mayúsculas, tildes ni espacios
-- en los bordes (incluye las inactivas, para que reactivar nunca choque).
create table public.categoria (
  id int generated always as identity primary key,
  nivel_id smallint not null references public.nivel_educativo (id),
  nombre varchar(150) not null check (btrim(nombre) <> ''),
  descripcion text not null default '',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index categoria_nivel_nombre_uniq
  on public.categoria (nivel_id, lower(public.inmutable_unaccent(btrim(nombre))));

-- RLS: anon y authenticated sin la marca solo leen las activas. Escribe solo el admin. Sin delete.
alter table public.categoria enable row level security;

create policy categoria_select
  on public.categoria
  for select
  to anon, authenticated
  using (activo or (select public.es_admin()));

create policy categoria_insert_admin
  on public.categoria
  for insert
  to authenticated
  with check ((select public.es_admin()));

create policy categoria_update_admin
  on public.categoria
  for update
  to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

-- Triggers -----------------------------------------------------------------
create trigger nivel_educativo_auditar
  after insert or update or delete on public.nivel_educativo
  for each row execute function public.auditar();

create trigger categoria_auditar
  after insert or update or delete on public.categoria
  for each row execute function public.auditar();

create trigger categoria_tocar_updated_at
  before update on public.categoria
  for each row execute function public.tocar_updated_at();
