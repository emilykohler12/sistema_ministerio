-- Corte padron, fase A (criterios 1, 2, 3, 4, 5 y 6): localidad y establecimiento.
-- No depende del seed: el usuario de prueba se crea dentro de la transaccion (rollback al final).
--
-- Notas de diseno del test:
-- - UPDATE y DELETE sin politica no dan error: afectan 0 filas. Se ejecutan sueltos y se verifica el
--   resultado como postgres. El INSERT sin permiso da 42501.
-- - Los throws_ok de unicidad comparan el mensaje exacto: fijan el nombre de cada constraint, que es
--   lo que el frontend (errores.ts) usa para distinguir CUE de nombre (contrato del criterio 6).
-- - Se asume establecimiento vacio al empezar (la migracion no siembra establecimientos).
begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

-- (RLS y auditar() en las dos tablas, y tocar_updated_at() en establecimiento: lo verifican las guardias globales.)

-- localidad: los 79 municipios de docs/specs/padron/localidades.md
select results_eq($$select count(*)::int from public.localidad$$, array[79], 'localidad tiene 79 filas');
select results_eq($$select nombre::text from public.localidad where id = 1$$, array['25 de Mayo'],
  'localidad 1 = 25 de Mayo');
select results_eq($$select nombre::text from public.localidad where id = 79$$, array['Tres Capones'],
  'localidad 79 = Tres Capones');
select results_eq($$select count(*)::int from public.localidad where nombre = 'Dos Hermanas'$$, array[1],
  'existe Dos Hermanas');
select results_eq($$select count(distinct id)::int from public.localidad where id between 1 and 79$$, array[79],
  'los ids van del 1 al 79 sin huecos');

-- Las 79 filas completas (id, nombre), segun docs/specs/padron/localidades.md
select results_eq(
  $$select id::int, nombre::text from public.localidad order by id$$,
  $$values
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
  (79, 'Tres Capones')$$,
  'localidad tiene exactamente los 79 municipios de localidades.md con sus ids');

-- Soporte del test (como postgres)
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444',
        'authenticated', 'authenticated', 'pad-admin@test.local');
insert into public.establecimiento (cue, nombre, localidad_id, activo)
values ('111', 'Escuela Activa A', 1, true),
       ('222', 'Escuela Inactiva B', 1, false);

-- anon
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select results_eq($$select count(*)::int from public.localidad$$, array[79], 'anon: lee las 79 localidades');
select throws_ok($$insert into public.localidad (id, nombre) values (80, 'Nueva')$$,
  '42501', null, 'anon: INSERT en localidad da 42501');
update public.localidad set nombre = 'Hack' where id = 1;
delete from public.localidad;
select results_eq($$select nombre::text from public.establecimiento order by nombre$$,
  array['Escuela Activa A'], 'anon: ve solo los establecimientos activos');
select throws_ok($$insert into public.establecimiento (nombre, localidad_id) values ('Hack', 1)$$,
  '42501', null, 'anon: INSERT en establecimiento da 42501');
select throws_ok($$update public.establecimiento set nombre = 'Hack'$$,
  '42501', null, 'anon: UPDATE en establecimiento da 42501 (sin privilegio)');
delete from public.establecimiento;
reset role;
select results_eq($$select count(*)::int from public.localidad where nombre in ('Hack', 'Nueva')$$, array[0],
  'anon: no cambia localidad');
select results_eq($$select count(*)::int from public.localidad$$, array[79], 'anon: DELETE en localidad no borra nada');
select results_eq($$select count(*)::int from public.establecimiento where nombre = 'Hack'$$, array[0],
  'anon: UPDATE en establecimiento no cambia nada');
select results_eq($$select count(*)::int from public.establecimiento$$, array[2],
  'anon: DELETE en establecimiento no borra nada');

-- authenticated sin marca de admin
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"44444444-4444-4444-4444-444444444444","app_metadata":{}}';
select results_eq($$select count(*)::int from public.localidad$$, array[79], 'sin marca: lee las 79 localidades');
select throws_ok($$insert into public.localidad (id, nombre) values (80, 'Nueva')$$,
  '42501', null, 'sin marca: INSERT en localidad da 42501');
update public.localidad set nombre = 'Hack' where id = 1;
delete from public.localidad;
select results_eq($$select nombre::text from public.establecimiento order by nombre$$,
  array['Escuela Activa A'], 'sin marca: ve solo los establecimientos activos');
select throws_ok($$insert into public.establecimiento (nombre, localidad_id) values ('Hack', 1)$$,
  '42501', null, 'sin marca: INSERT en establecimiento da 42501');
update public.establecimiento set nombre = 'Hack';
delete from public.establecimiento;
reset role;
select results_eq($$select count(*)::int from public.localidad where nombre in ('Hack', 'Nueva')$$, array[0],
  'sin marca: no cambia localidad');
select results_eq($$select count(*)::int from public.localidad$$, array[79], 'sin marca: DELETE en localidad no borra nada');
select results_eq($$select count(*)::int from public.establecimiento where nombre = 'Hack'$$, array[0],
  'sin marca: UPDATE en establecimiento no cambia nada');
select results_eq($$select count(*)::int from public.establecimiento$$, array[2],
  'sin marca: DELETE en establecimiento no borra nada');

-- admin
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"44444444-4444-4444-4444-444444444444","app_metadata":{"admin":true}}';
select results_eq($$select nombre::text from public.establecimiento order by nombre$$,
  array['Escuela Activa A', 'Escuela Inactiva B'], 'admin: ve todos los establecimientos, tambien los inactivos');
select throws_ok($$insert into public.localidad (id, nombre) values (80, 'Nueva')$$,
  '42501', null, 'admin: INSERT en localidad da 42501');
update public.localidad set nombre = 'Hack' where id = 1;
delete from public.localidad;
select lives_ok(
  $$insert into public.establecimiento (cue, nombre, localidad_id) values ('333', 'Escuela Nueva', 1)$$,
  'admin: INSERT en establecimiento funciona');
select lives_ok(
  $$update public.establecimiento set nombre = 'Escuela Editada' where nombre = 'Escuela Nueva'$$,
  'admin: UPDATE en establecimiento funciona');
update public.establecimiento set activo = false where nombre = 'Escuela Editada';
update public.establecimiento set activo = true where nombre = 'Escuela Editada';
delete from public.establecimiento;
reset role;
select results_eq($$select count(*)::int from public.localidad where nombre in ('Hack', 'Nueva')$$, array[0],
  'admin: UPDATE e INSERT en localidad no tienen efecto');
select results_eq($$select count(*)::int from public.localidad$$, array[79], 'admin: DELETE en localidad no tiene efecto');
select results_eq($$select count(*)::int from public.establecimiento$$, array[3],
  'admin: DELETE en establecimiento no tiene efecto');
select results_eq($$select nombre::text from public.establecimiento where cue = '333'$$,
  array['Escuela Editada'], 'admin: UPDATE en establecimiento cambia el valor');
select results_eq(
  $$select count(*)::int from public.registro_operacion
    where tabla = 'establecimiento' and operacion = 'INSERT'
      and registro_id = (select id::text from public.establecimiento where cue = '333')
      and usuario_id = '44444444-4444-4444-4444-444444444444'$$,
  array[1], 'el INSERT del admin queda en registro_operacion con su usuario_id');

-- Unicidad normalizada de (localidad, nombre), tambien contra inactivos (como admin)
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"44444444-4444-4444-4444-444444444444","app_metadata":{"admin":true}}';
select throws_ok(
  $$insert into public.establecimiento (nombre, localidad_id) values ('escuela editada', 1)$$,
  '23505', 'duplicate key value violates unique constraint "establecimiento_localidad_nombre_uniq"',
  'duplicado por mayusculas en la misma localidad da 23505 con el nombre del indice');
select throws_ok(
  $$insert into public.establecimiento (nombre, localidad_id) values ('Escuéla Editáda', 1)$$,
  '23505', 'duplicate key value violates unique constraint "establecimiento_localidad_nombre_uniq"',
  'duplicado por tildes en la misma localidad da 23505');
select throws_ok(
  $$insert into public.establecimiento (nombre, localidad_id) values ('  Escuela Editada ', 1)$$,
  '23505', 'duplicate key value violates unique constraint "establecimiento_localidad_nombre_uniq"',
  'duplicado por espacios en los bordes da 23505');
select throws_ok(
  $$insert into public.establecimiento (nombre, localidad_id) values ('ESCUELA INACTIVA B', 1)$$,
  '23505', 'duplicate key value violates unique constraint "establecimiento_localidad_nombre_uniq"',
  'duplicado contra un establecimiento inactivo da 23505');
select throws_ok(
  $$update public.establecimiento set nombre = ' escuela activa a ' where cue = '333'$$,
  '23505', 'duplicate key value violates unique constraint "establecimiento_localidad_nombre_uniq"',
  'duplicado por UPDATE da 23505');
select throws_ok(
  $$update public.establecimiento set nombre = 'escuela inactiva b' where cue = '333'$$,
  '23505', 'duplicate key value violates unique constraint "establecimiento_localidad_nombre_uniq"',
  'duplicado por UPDATE contra un inactivo da 23505');
select lives_ok(
  $$insert into public.establecimiento (nombre, localidad_id) values ('Escuela Editada', 2)$$,
  'el mismo nombre en otra localidad pasa');

-- CUE: unico, solo digitos, varios NULL permitidos
select throws_ok(
  $$insert into public.establecimiento (cue, nombre, localidad_id) values ('111', 'Otra escuela', 3)$$,
  '23505', 'duplicate key value violates unique constraint "establecimiento_cue_key"',
  'CUE repetido da 23505 con el nombre establecimiento_cue_key');
select throws_ok(
  $$update public.establecimiento set cue = '222' where cue = '333'$$,
  '23505', 'duplicate key value violates unique constraint "establecimiento_cue_key"',
  'CUE repetido por UPDATE (contra un inactivo) da 23505');
select lives_ok(
  $$insert into public.establecimiento (cue, nombre, localidad_id) values (null, 'Sin CUE uno', 3), (null, 'Sin CUE dos', 3)$$,
  'varios establecimientos sin CUE (NULL) no chocan');
select throws_ok(
  $$insert into public.establecimiento (cue, nombre, localidad_id) values ('12a4', 'CUE con letra', 3)$$,
  '23514', null, 'CUE con letras da 23514');
select throws_ok(
  $$insert into public.establecimiento (cue, nombre, localidad_id) values ('', 'CUE vacio', 3)$$,
  '23514', null, 'CUE vacio ("") da 23514: el formulario lo manda como NULL');
select throws_ok(
  $$insert into public.establecimiento (cue, nombre, localidad_id) values ('123456789012345678901', 'CUE largo', 3)$$,
  '22001', null, 'CUE de mas de 20 digitos es rechazado: el largo lo corta el tipo varchar(20)');

-- Constraints del nombre y la localidad
select throws_ok(
  $$insert into public.establecimiento (nombre, localidad_id) values ('   ', 3)$$,
  '23514', null, 'nombre en blanco da 23514');
select throws_ok(
  $$update public.establecimiento set nombre = '' where cue = '333'$$,
  '23514', null, 'UPDATE a nombre vacio da 23514');
select throws_ok(
  $$insert into public.establecimiento (nombre, localidad_id) values ('Huerfana', 9999)$$,
  '23503', null, 'localidad_id inexistente da 23503');

-- Grant de UPDATE por columna: solo cue, nombre, localidad_id y activo
select throws_ok(
  $$update public.establecimiento set created_at = now() where cue = '333'$$,
  '42501', null, 'admin: UPDATE de created_at da 42501');
select throws_ok(
  $$update public.establecimiento set id = 999999 where cue = '333'$$,
  '428C9', null, 'admin: UPDATE de id da 428C9 (generated always, como categoria)');
select lives_ok(
  $$update public.establecimiento set localidad_id = 4, cue = '444' where cue = '333'$$,
  'admin: UPDATE de localidad_id y cue funciona');
reset role;

select * from finish();
rollback;
