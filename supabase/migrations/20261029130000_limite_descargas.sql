-- Limite de frecuencia de las descargas (#26, 0030).
-- registrar_descarga deja de CONTAR las descargas de una IP con 30 intentos en los ultimos 10 minutos. No rechaza ni lanza:
-- responde bien sin insertar, como con el admin (#25). Se protegen las metricas, no el acceso (la firma de enlaces no depende de la RPC, 0022).

-- intento_descarga: un renglon por descarga contada, con el sha256 de la IP (nunca la IP). Solo la RPC (security definer) la toca.
-- Sin politicas y sin grants para anon ni authenticated; service_role la limpia en los e2e. Sin auditar(): es un dato operativo
-- efimero (excepcion en auditoria_global). Sin updated_at: nunca se modifica.
create table public.intento_descarga (
  id bigint generated always as identity primary key,
  ip_hash bytea not null,
  fecha_hora timestamptz not null default now()
);
create index intento_descarga_ip_hash_fecha_hora_idx on public.intento_descarga (ip_hash, fecha_hora);

alter table public.intento_descarga enable row level security;
revoke all on table public.intento_descarga from anon, authenticated;
revoke all on sequence public.intento_descarga_id_seq from anon, authenticated;

-- ip_cliente: la IP del cliente segun el gateway. Un solo encabezado, x-real-ip (Kong lo pisa); sin fallback. Si el alojado
-- trae otro, se cambia solo esta funcion. nullif evita el 22P02 de ''::json cuando el GUC quedo fijado en '' en la sesion.
-- Supabase da EXECUTE por defecto a anon, authenticated y service_role: se revoca. El definer la llama como dueno.
create function public.ip_cliente()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('request.headers', true), '')::json ->> 'x-real-ip'
$$;
revoke execute on function public.ip_cliente() from public, anon, authenticated, service_role;

-- registrar_descarga: igual que en no_contar_admin.sql, mas el tope despues del chequeo del admin. DA003 y DA004 se evaluan antes.
-- Solo cuenta la llamada que inserta: un CHECK que falla revierte tambien el intento. Sin IP no hay tope ni intento.
-- create or replace conserva el dueno y los grants; se repiten security definer y search_path porque proconfig se reemplaza.
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
  c_tope constant int := 30;
  c_ventana constant interval := interval '10 minutes';
  v_cargo_otro text;
  v_institucion_otra text;
  v_establecimiento_id int;
  v_ip text;
  v_ip_hash bytea;
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

  v_ip := public.ip_cliente();
  if v_ip is not null then
    v_ip_hash := sha256(convert_to(v_ip, 'UTF8'));

    -- El lock por hash serializa las llamadas de la misma IP: el tope es exacto aunque lleguen en paralelo.
    perform pg_advisory_xact_lock(hashtextextended(v_ip, 0));

    -- Purga global: la tabla solo guarda los ultimos 10 minutos, de cualquier IP.
    delete from public.intento_descarga where fecha_hora < now() - c_ventana;

    -- Con el tope alcanzado responde bien sin insertar nada: no cuenta.
    if (
      select count(*) from public.intento_descarga
       where ip_hash = v_ip_hash and fecha_hora > now() - c_ventana
    ) >= c_tope then
      return;
    end if;

    insert into public.intento_descarga (ip_hash) values (v_ip_hash);
  end if;

  insert into public.registro_descarga
    (taller_id, cargo, cargo_otro, localidad_id, institucion_tipo, establecimiento_id, institucion_otra)
  values
    (p_taller_id, p_cargo, v_cargo_otro, p_localidad_id, p_institucion_tipo, v_establecimiento_id, v_institucion_otra);
end;
$$;
