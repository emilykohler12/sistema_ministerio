-- Corte padron, fase A (ADR 0010, 0012): localidades de Misiones y establecimientos educativos.

-- localidad ------------------------------------------------------------------
-- Los 79 municipios de docs/specs/padron/localidades.md, con ids explicitos del 1 al 79 en orden alfabetico.
-- Catalogo fijo: ningun rol de la API escribe. Un municipio nuevo toma el siguiente id libre en una migracion nueva.
-- Sin created_at/updated_at (como nivel_educativo).
create table public.localidad (
  id smallint primary key,
  nombre varchar(100) not null check (btrim(nombre) <> '')
);

create unique index localidad_nombre_uniq
  on public.localidad (lower(public.inmutable_unaccent(btrim(nombre))));

insert into public.localidad (id, nombre)
values
  (1, '25 de Mayo'),
  (2, '9 de Julio'),
  (3, 'Alba Posse'),
  (4, 'Almafuerte'),
  (5, 'Apóstoles'),
  (6, 'Aristóbulo del Valle'),
  (7, 'Arroyo del Medio'),
  (8, 'Azara'),
  (9, 'Bernardo de Irigoyen'),
  (10, 'Bonpland'),
  (11, 'Caá Yarí'),
  (12, 'Campo Grande'),
  (13, 'Campo Ramón'),
  (14, 'Campo Viera'),
  (15, 'Candelaria'),
  (16, 'Capioví'),
  (17, 'Caraguatay'),
  (18, 'Cerro Azul'),
  (19, 'Cerro Corá'),
  (20, 'Colonia Alberdi'),
  (21, 'Colonia Aurora'),
  (22, 'Colonia Delicia'),
  (23, 'Colonia Polana'),
  (24, 'Colonia Victoria'),
  (25, 'Colonia Wanda'),
  (26, 'Comandante Andresito'),
  (27, 'Concepción de la Sierra'),
  (28, 'Corpus Christi'),
  (29, 'Dos Arroyos'),
  (30, 'Dos de Mayo'),
  (31, 'Dos Hermanas'),
  (32, 'El Alcázar'),
  (33, 'El Soberbio'),
  (34, 'Eldorado'),
  (35, 'Fachinal'),
  (36, 'Florentino Ameghino'),
  (37, 'Fracrán'),
  (38, 'Garuhapé'),
  (39, 'Garupá'),
  (40, 'General Alvear'),
  (41, 'General Urquiza'),
  (42, 'Gobernador López'),
  (43, 'Gobernador Roca'),
  (44, 'Guaraní'),
  (45, 'Hipólito Yrigoyen'),
  (46, 'Itacaruaré'),
  (47, 'Jardín América'),
  (48, 'Leandro N. Alem'),
  (49, 'Libertad'),
  (50, 'Loreto'),
  (51, 'Los Helechos'),
  (52, 'Mártires'),
  (53, 'Mojón Grande'),
  (54, 'Montecarlo'),
  (55, 'Oberá'),
  (56, 'Olegario V. Andrade'),
  (57, 'Panambí'),
  (58, 'Posadas'),
  (59, 'Pozo Azul'),
  (60, 'Profundidad'),
  (61, 'Puerto Esperanza'),
  (62, 'Puerto Iguazú'),
  (63, 'Puerto Leoni'),
  (64, 'Puerto Piray'),
  (65, 'Puerto Rico'),
  (66, 'Ruiz de Montoya'),
  (67, 'Salto Encantado'),
  (68, 'San Antonio'),
  (69, 'San Ignacio'),
  (70, 'San Javier'),
  (71, 'San José'),
  (72, 'San Martín'),
  (73, 'San Pedro'),
  (74, 'San Vicente'),
  (75, 'Santa Ana'),
  (76, 'Santa María'),
  (77, 'Santiago de Liniers'),
  (78, 'Santo Pipó'),
  (79, 'Tres Capones');

-- Solo lectura publica. Sin politicas de escritura: ningun rol de la API (tampoco el admin) las modifica.
alter table public.localidad enable row level security;

create policy localidad_select_publico
  on public.localidad
  for select
  to anon, authenticated
  using (true);

-- establecimiento --------------------------------------------------------------
-- Baja logica con "activo". El nombre es unico por localidad sin distinguir mayusculas, tildes ni espacios en los
-- bordes (incluye los inactivos, para que reactivar nunca choque). El CUE es opcional, unico y solo digitos.
-- Los nombres de la constraint y del indice son contrato: el frontend (errores.ts) distingue CUE de nombre por
-- el nombre que viaja dentro de `message` en el 23505.
create table public.establecimiento (
  id int generated always as identity primary key,
  cue varchar(20) constraint establecimiento_cue_key unique check (cue ~ '^[0-9]{1,20}$'),
  nombre varchar(200) not null check (btrim(nombre) <> ''),
  localidad_id smallint not null references public.localidad (id),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index establecimiento_localidad_nombre_uniq
  on public.establecimiento (localidad_id, lower(public.inmutable_unaccent(btrim(nombre))));

-- RLS: anon y authenticated sin la marca solo leen los activos. Escribe solo el admin. Sin delete.
alter table public.establecimiento enable row level security;

create policy establecimiento_select
  on public.establecimiento
  for select
  to anon, authenticated
  using (activo or (select public.es_admin()));

create policy establecimiento_insert_admin
  on public.establecimiento
  for insert
  to authenticated
  with check ((select public.es_admin()));

create policy establecimiento_update_admin
  on public.establecimiento
  for update
  to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

-- Solo se edita lo del formulario: id, created_at y updated_at quedan cerrados. Se revoca el UPDATE de tabla y se da
-- por columna al admin (authenticated; la RLS decide quien).
revoke update on public.establecimiento from anon, authenticated;
grant update (cue, nombre, localidad_id, activo) on public.establecimiento to authenticated;

-- Triggers -----------------------------------------------------------------
create trigger localidad_auditar
  after insert or update or delete on public.localidad
  for each row execute function public.auditar();

create trigger establecimiento_auditar
  after insert or update or delete on public.establecimiento
  for each row execute function public.auditar();

create trigger establecimiento_tocar_updated_at
  before update on public.establecimiento
  for each row execute function public.tocar_updated_at();
