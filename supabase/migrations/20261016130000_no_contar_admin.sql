-- No contar las descargas del administrador (#25).
-- Con sesion de admin (es_admin() lee el JWT, que no cambia dentro de un SECURITY DEFINER) las dos RPC que cuentan
-- descargas vuelven sin error y sin contar. El cliente no cambia: el admin que descarga o abre un PDF recibe la misma
-- respuesta que cualquiera. Con service_role (scripts) es_admin() da falso y cuenta. Los datos ya registrados no se tocan.
-- create or replace conserva el dueno y los grants; se repiten security definer y search_path porque proconfig se reemplaza.

-- registrar_descarga: valida DA003 y DA004 igual que antes y, con sesion de admin, vuelve antes del insert. Por eso los
-- CHECK de la tabla (cargo fuera de la lista, 'Otro' en blanco, PADRON sin establecimiento) no se evaluan para el admin:
-- el zod del formulario aplica las mismas reglas, e insertar y borrar ensuciaria la auditoria.
create or replace function public.registrar_descarga(
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

  -- El administrador no cuenta (#25): responde bien, pero no registra.
  if public.es_admin() then
    return;
  end if;

  insert into public.registro_descarga
    (taller_id, cargo, cargo_otro, localidad_id, institucion_tipo, establecimiento_id, institucion_otra)
  values
    (p_taller_id, p_cargo, v_cargo_otro, p_localidad_id, p_institucion_tipo, v_establecimiento_id, v_institucion_otra);
end;
$$;

-- contar_descarga_normativa: el filtro va en el where; con sesion de admin no actualiza ninguna fila.
create or replace function public.contar_descarga_normativa(p_id int)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.normativa
     set descargas = descargas + 1
   where id = p_id and not (select public.es_admin());
$$;
