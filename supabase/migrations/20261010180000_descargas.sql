-- Corte descargas, fase A (ADR 0006, 0010, 0015, 0017, 0022): registro de descargas de talleres, la RPC anonima que lo
-- inserta y la politica de Storage que deja a anon firmar los archivos de talleres publicados. Reemplaza a la Edge Function
-- `descargar-taller` de 0006 (0022).

-- tipo_institucion -------------------------------------------------------------
-- Lista cerrada usada como tipo de columna: enum (0015). El cargo, que tiene "Otro", va como varchar + CHECK.
create type public.tipo_institucion as enum ('PADRON', 'OTRA', 'SIN_INSTITUCION');

-- registro_descarga ----------------------------------------------------------------
-- Un registro por formulario completado (definicion §8.3). Hecho historico: sin updated_at y sin cascada en las FK.
-- institucion_otra guarda el nombre escrito a mano; la vinculacion futura completa establecimiento_id sin borrarlo.
create table public.registro_descarga (
  id bigint generated always as identity primary key,
  taller_id int not null references public.taller (id),
  cargo varchar(30) not null,
  cargo_otro varchar(100),
  localidad_id smallint not null references public.localidad (id),
  institucion_tipo public.tipo_institucion not null,
  establecimiento_id int references public.establecimiento (id),
  institucion_otra varchar(200),
  fecha_hora timestamptz not null default now(),
  constraint registro_descarga_cargo_check
    check (cargo in ('Director/a', 'Vicedirector/a', 'Secretario/a', 'Docente', 'Supervisor/a', 'Otro')),
  -- cargo_otro existe si y solo si el cargo es "Otro", y no es vacio ni lleva espacios en los extremos.
  constraint registro_descarga_cargo_otro_check
    check ((cargo = 'Otro') = (cargo_otro is not null)
           and (cargo_otro is null or (cargo_otro <> '' and cargo_otro = btrim(cargo_otro)))),
  -- institucion_otra existe si y solo si el tipo es OTRA, con las mismas reglas de texto.
  constraint registro_descarga_institucion_otra_check
    check ((institucion_tipo = 'OTRA') = (institucion_otra is not null)
           and (institucion_otra is null or (institucion_otra <> '' and institucion_otra = btrim(institucion_otra)))),
  -- PADRON: hay establecimiento. OTRA: el establecimiento puede estar (se completa al vincular). SIN_INSTITUCION: ninguno.
  constraint institucion_coherente
    check (case institucion_tipo
             when 'PADRON' then establecimiento_id is not null
             when 'OTRA' then true
             else establecimiento_id is null
           end)
);

create index registro_descarga_taller_id_idx on public.registro_descarga (taller_id);

-- RLS: lee solo el admin. Nadie escribe por la API: ni anon ni authenticated tienen grants de escritura (los privilegios por
-- defecto de Supabase los daban todos); el unico insert es el de registrar_descarga (security definer, mas abajo).
alter table public.registro_descarga enable row level security;

revoke all on public.registro_descarga from anon, authenticated;
grant select on public.registro_descarga to authenticated;
revoke all on sequence public.registro_descarga_id_seq from anon, authenticated;

create policy registro_descarga_select_admin
  on public.registro_descarga
  for select
  to authenticated
  using ((select public.es_admin()));

-- Auditoria sin INSERT (0022): el insert es un hecho anonimo y la tabla ya es su registro; auditarlo lo duplicaria con
-- usuario_id nulo. Un update o delete (la vinculacion futura, una correccion) si se audita. auditoria_global exige la
-- excepcion por evento.
create trigger registro_descarga_auditar
  after update or delete on public.registro_descarga
  for each row execute function public.auditar();

-- registrar_descarga ----------------------------------------------------------------
-- La llama el navegador de cualquier visitante al completar el formulario. SECURITY DEFINER: nadie tiene INSERT sobre la
-- tabla; corre como el dueno (bypassrls). Por eso el estado PUBLICADO del taller se comprueba aca, de forma explicita.
-- 1. Normaliza segun el discriminador (un formulario con estado residual no falla por algo que el usuario no hizo):
--    cargo_otro solo con 'Otro', institucion_otra solo con OTRA, establecimiento_id solo con PADRON; recorta y convierte lo
--    vacio en null. Despues los CHECK validan (un 'Otro' en blanco da 23514).
-- 2. DA003: el taller no existe o no esta publicado.
-- 3. DA004: con PADRON, el establecimiento no existe, esta inactivo o es de otra localidad. Con PADRON sin id no se decide
--    aca: lo rechaza el CHECK.
-- Los opcionales van al final con default null (db:types solo marca opcionales los que tienen default).
create function public.registrar_descarga(
  p_taller_id int,
  p_cargo text,
  p_localidad_id smallint,
  p_institucion_tipo public.tipo_institucion,
  p_cargo_otro text default null,
  p_establecimiento_id int default null,
  p_institucion_otra text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cargo_otro text;
  v_institucion_otra text;
  v_establecimiento_id int;
begin
  v_cargo_otro := case when p_cargo = 'Otro' then nullif(btrim(p_cargo_otro), '') end;
  v_institucion_otra := case when p_institucion_tipo = 'OTRA' then nullif(btrim(p_institucion_otra), '') end;
  v_establecimiento_id := case when p_institucion_tipo = 'PADRON' then p_establecimiento_id end;

  if not exists (
    select 1 from public.taller t where t.id = p_taller_id and t.estado = 'PUBLICADO'
  ) then
    raise exception 'El taller % no esta disponible', p_taller_id using errcode = 'DA003';
  end if;

  if v_establecimiento_id is not null and not exists (
    select 1 from public.establecimiento e
     where e.id = v_establecimiento_id and e.activo and e.localidad_id = p_localidad_id
  ) then
    raise exception 'El establecimiento % no esta disponible en la localidad %', v_establecimiento_id, p_localidad_id
      using errcode = 'DA004';
  end if;

  insert into public.registro_descarga
    (taller_id, cargo, cargo_otro, localidad_id, institucion_tipo, establecimiento_id, institucion_otra)
  values
    (p_taller_id, p_cargo, v_cargo_otro, p_localidad_id, p_institucion_tipo, v_establecimiento_id, v_institucion_otra);
end;
$$;

-- Postgres da EXECUTE a PUBLIC y Supabase lo agrega a anon por privilegios por defecto: se cierra a mano y se abre solo
-- a los dos roles de la API.
revoke execute on function public.registrar_descarga(int, text, smallint, public.tipo_institucion, text, int, text)
  from public;
grant execute on function public.registrar_descarga(int, text, smallint, public.tipo_institucion, text, int, text)
  to anon, authenticated;

-- Storage: lectura de anon en el bucket 'talleres' --------------------------------------
-- El bucket es privado (migracion de recursos) y el admin es el unico con politicas. Para firmar un enlace
-- (createSignedUrl) hace falta SELECT sobre el objeto: anon lo tiene solo si la ruta pertenece a un recurso que ya ve por
-- la RLS de recurso/taller (talleres publicados). Un objeto huerfano (sin fila) o de un taller en borrador o inactivo queda
-- cerrado. La subconsulta corre con la RLS de anon; la columna se califica (objects.name) para que no cambie de
-- significado si recurso gana alguna vez una columna "name". Pierde el control del expiresIn y no revoca los enlaces ya
-- emitidos al despublicar (0022). No es una politica de escritura: storage_global no la alcanza.
create policy talleres_select_anon
  on storage.objects
  for select
  to anon
  using (
    bucket_id = 'talleres'
    and exists (select 1 from public.recurso r where r.ruta_archivo = objects.name)
  );
